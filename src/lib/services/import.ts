import { asc } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { events, guests, DELIVERY_CHANNELS, LOCALES, SIDES } from '@/db/schema';
import { parseCsvWithHeader } from '@/lib/domain/csv';
import { importKey, normalizePhone } from '@/lib/domain/phone';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import type { DeliveryChannelName, Locale, Side } from './types';
import {
  createGuest,
  ensureDeliveryChannels,
  updateGuest,
  validateGuestCreate,
  validateGuestUpdate,
} from './guests';
import { withTransaction } from './transactions';

/**
 * PERMANENT. CSV import for the guest list.
 *
 * Three properties the spec asks for, and why each matters:
 *   - Idempotent on (sort_name, phone), normalized. Re-running the same file
 *     updates rather than duplicating, so a half-finished import can simply be
 *     run again.
 *   - Per-row errors. One bad row reports itself and the other 499 still land.
 *   - Generates a token for new rows only, so re-importing never invalidates
 *     a link that has already been sent to somebody.
 */

export type ImportRowResult = {
  /** 1-based, counting the header as row 1, so it matches what Excel shows. */
  row: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  displayName: string;
  message?: string;
  token?: string;
};

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: ImportRowResult[];
  dryRun: boolean;
};

const HEADER_HELP =
  'Expected columns: display_name (required), side (bride|groom|both, required), ' +
  'display_name_fallback, sort_name, language, max_party_size, phone, ' +
  'notes, events, channels.';

/** Accepts "display_name", "display name" and "displayname". */
function pick(record: Record<string, string>, name: string): string {
  const variants = [name, name.replace(/_/g, ' '), name.replace(/_/g, '')];
  for (const variant of variants) {
    const value = record[variant];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

/** Multi-values use ; or | so they never collide with CSV's own comma. */
function splitList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export async function importGuestsCsv(
  csv: string,
  options: { defaultEventSlugs?: string[]; dryRun?: boolean } = {},
  db: DbLike = getDb(),
): Promise<Result<ImportSummary>> {
  const dryRun = options.dryRun ?? false;

  const { headers, rows } = parseCsvWithHeader(csv);
  if (rows.length > 1000) {
    return serviceError('validation', 'A CSV import can contain at most 1000 guest rows.', 'csv');
  }
  if (headers.length === 0) {
    return ok({ created: 0, updated: 0, skipped: 0, errors: 0, results: [], dryRun });
  }

  const [existingGuests, eventRows] = await Promise.all([
    db.select().from(guests),
    db.select().from(events).orderBy(asc(events.sortOrder)),
  ]);

  const knownSlugs = new Set(eventRows.map((row) => row.slug));
  const defaultSlugs = options.defaultEventSlugs ?? [];
  const unknownDefaults = defaultSlugs.filter((slug) => !knownSlugs.has(slug));
  if (unknownDefaults.length) {
    return serviceError('validation', `Unknown event slug: ${unknownDefaults.join(', ')}.`, 'defaultEventSlugs');
  }

  // Existing rows, keyed the same way new rows will be.
  const byKey = new Map(
    existingGuests.map((row) => [importKey(row.sortName, row.phone), row]),
  );

  // Rows seen earlier in THIS file, so a file that repeats a household reports
  // the repeat rather than writing it twice.
  const seenInFile = new Map<string, number>();

  const results: ImportRowResult[] = [];

  for (const [index, record] of rows.entries()) {
    const rowNumber = index + 2; // +1 for zero-index, +1 for the header row
    const displayName = pick(record, 'display_name');

    const fail = (message: string) =>
      results.push({ row: rowNumber, status: 'error', displayName, message });

    if (displayName === '') {
      fail(`display_name is required. ${HEADER_HELP}`);
      continue;
    }

    const sideRaw = pick(record, 'side').toLowerCase();
    if (!(SIDES as readonly string[]).includes(sideRaw)) {
      fail(`side must be one of ${SIDES.join(', ')} (got '${sideRaw || 'empty'}').`);
      continue;
    }
    const side = sideRaw as Side;

    const languageRaw = pick(record, 'language').toLowerCase();
    if (languageRaw !== '' && !(LOCALES as readonly string[]).includes(languageRaw)) {
      fail(`language must be one of ${LOCALES.join(', ')} (got '${languageRaw}').`);
      continue;
    }
    const language = (languageRaw || 'en') as Locale;

    const maxRaw = pick(record, 'max_party_size');
    const maxPartySize = maxRaw === '' ? 2 : Number(maxRaw);
    if (!Number.isInteger(maxPartySize) || maxPartySize < 1 || maxPartySize > 50) {
      fail(`max_party_size must be a whole number between 1 and 50 (got '${maxRaw}').`);
      continue;
    }

    const phone = pick(record, 'phone') || null;
    // Derived rather than required: most real lists do not carry a sort name.
    const sortName = pick(record, 'sort_name') || displayName;

    const eventsRaw = splitList(pick(record, 'events'));
    const unknownEvents = eventsRaw.filter((slug) => !knownSlugs.has(slug));
    if (unknownEvents.length) {
      fail(
        `unknown event slug: ${unknownEvents.join(', ')}. ` +
          `Known slugs: ${[...knownSlugs].join(', ')}.`,
      );
      continue;
    }
    const eventSlugs = eventsRaw.length ? eventsRaw : defaultSlugs;

    const channelsRaw = splitList(pick(record, 'channels'));
    const unknownChannels = channelsRaw.filter(
      (channel) => !(DELIVERY_CHANNELS as readonly string[]).includes(channel),
    );
    if (unknownChannels.length) {
      fail(
        `unknown delivery channel: ${unknownChannels.join(', ')}. ` +
          `Known channels: ${DELIVERY_CHANNELS.join(', ')}.`,
      );
      continue;
    }

    const key = importKey(sortName, phone);

    const duplicateOf = seenInFile.get(key);
    if (duplicateOf !== undefined) {
      fail(
        `duplicate of row ${duplicateOf} - same sort_name and phone. ` +
          'Give one of them a distinct phone number, or merge the rows.',
      );
      continue;
    }
    seenInFile.set(key, rowNumber);

    const existing = byKey.get(key);

    const payload = {
      displayName,
      sortName,
      side,
      language,
      maxPartySize,
      phone: normalizePhone(phone),
      displayNameFallback: pick(record, 'display_name_fallback') || null,
      notes: pick(record, 'notes') || null,
      ...(eventSlugs.length ? { eventSlugs } : {}),
    };

    try {
      if (dryRun) {
        const validation = existing
          ? await validateGuestUpdate(existing.id, payload, db)
          : await validateGuestCreate(payload, db);
        if (!validation.ok) {
          fail(validation.error.message);
          continue;
        }
        results.push({
          row: rowNumber,
          status: existing ? 'updated' : 'created',
          displayName,
          ...(existing ? { token: existing.token } : {}),
        });
        continue;
      }

      // Each row is independent, but its guest, invitations and new channels
      // commit together. Commands compose using savepoints on this transaction.
      const saved = await withTransaction(db, async (tx) => {
        const result = existing
          ? await updateGuest(existing.id, payload, tx)
          : await createGuest(payload, tx);
        if (!result.ok) return result;
        await ensureDeliveryChannels(result.data.id, channelsRaw as DeliveryChannelName[], tx);
        return result;
      });
      if (!saved.ok) {
        fail(saved.error.message);
        continue;
      }
      results.push({
        row: rowNumber,
        status: existing ? 'updated' : 'created',
        displayName,
        // Updates always preserve the existing token, including re-imports.
        token: saved.data.token,
      });
    } catch {
      // Do not expose SQL or connection details. A failed row rolls back and
      // the remainder still receive individual results.
      fail('This row could not be saved. No changes from this row were kept; please retry.');
    }
  }

  return ok({
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
    dryRun,
  });
}
