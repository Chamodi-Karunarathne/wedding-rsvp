import { randomUUID } from 'node:crypto';
import { asc, inArray, sql } from 'drizzle-orm';
import { getDb, type DbLike, type Tx } from '@/db/client';
import {
  deliveryChannels, events, guests, invitations, rsvps,
  DELIVERY_CHANNELS, type GuestRow, type NewGuestRow,
} from '@/db/schema';
import { CsvParseError, parseCsvWithHeader } from '@/lib/domain/csv';
import { guestInputSchema } from '@/lib/domain/guest-input';
import { generateToken } from '@/lib/domain/ids';
import { importKey, normalizePhone } from '@/lib/domain/phone';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import { validateGuestResponseConstraints, type GuestInput } from './guests';
import type { DeliveryChannelName } from './types';

/** CSV import never replaces invitation tokens, responses or delivery progress. */
export type ImportRowResult = {
  /** Physical CSV starting line, including the header and multiline fields. */
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

const COLUMNS = [
  'display_name', 'side', 'display_name_fallback', 'sort_name', 'language',
  'max_party_size', 'phone', 'notes', 'events', 'channels',
] as const;
type Column = (typeof COLUMNS)[number];
type Candidate = {
  row: number;
  displayName: string;
  key: string;
  input: GuestInput;
  supplied: Set<Column>;
  channels: DeliveryChannelName[];
};
type Planned = { candidate: Candidate; existing?: GuestRow; values: NewGuestRow; eventIds?: string[] };
const BATCH_SIZE = 25;
const canonicalHeader = (header: string) => header.replace(/[ _]/g, '');
const splitList = (value: string) => [...new Set(value.split(/[;|]/).map((v) => v.trim()).filter(Boolean))];
const failure = (candidate: Pick<Candidate, 'row' | 'displayName'>, message: string): ImportRowResult =>
  ({ row: candidate.row, status: 'error', displayName: candidate.displayName, message });

/** Validate the complete file before starting any writes. */
export async function importGuestsCsv(
  csv: string,
  options: { defaultEventSlugs?: string[]; dryRun?: boolean } = {},
  db: DbLike = getDb(),
): Promise<Result<ImportSummary>> {
  const dryRun = options.dryRun ?? false;
  let parsed: ReturnType<typeof parseCsvWithHeader>;
  try {
    parsed = parseCsvWithHeader(csv);
  } catch (error) {
    if (error instanceof CsvParseError) return serviceError('validation', error.message, 'csv');
    throw error;
  }
  const { headers, rows, rowNumbers } = parsed;
  if (rows.length > 1000) {
    return serviceError('validation', 'A CSV import can contain at most 1000 guest rows.', 'csv');
  }
  const names = new Map<Column, string>();
  for (const header of headers) {
    const name = COLUMNS.find((column) => canonicalHeader(column) === canonicalHeader(header));
    if (!name) continue; // Unrelated spreadsheet columns are harmless.
    if (names.has(name)) return serviceError('validation', `More than one column maps to ${name}. Keep only one.`, 'csv');
    names.set(name, header);
  }
  if (!names.has('display_name') || !names.has('side')) {
    return serviceError('validation', 'CSV must contain display_name and side columns.', 'csv');
  }
  if (!rows.length) return serviceError('validation', 'CSV contains no guest rows.', 'csv');

  const eventRows = await db.select().from(events).orderBy(asc(events.sortOrder));
  const eventIds = new Map(eventRows.map((event) => [event.slug, event.id]));
  const defaultSlugs = [...new Set(options.defaultEventSlugs ?? [])];
  const unknownDefaults = defaultSlugs.filter((slug) => !eventIds.has(slug));
  if (unknownDefaults.length) {
    return serviceError('validation', `Unknown event slug: ${unknownDefaults.join(', ')}.`, 'defaultEventSlugs');
  }

  const results: ImportRowResult[] = [];
  const candidates: Candidate[] = [];
  const seen = new Map<string, number>();
  for (const [index, record] of rows.entries()) {
    const pick = (name: Column) => record[names.get(name) ?? ''] ?? '';
    const displayName = pick('display_name');
    const row = rowNumbers[index]!;
    const sortName = pick('sort_name') || displayName;
    const phoneRaw = pick('phone');
    const phone = normalizePhone(phoneRaw);
    const slugs = splitList(pick('events'));
    const eventSlugs = slugs.length ? slugs : defaultSlugs;
    const channels = splitList(pick('channels'));
    const maxRaw = pick('max_party_size');
    const input = {
      displayName,
      sortName,
      side: pick('side').toLowerCase(),
      language: pick('language').toLowerCase() || 'en',
      maxPartySize: maxRaw === '' ? 2 : Number(maxRaw),
      phone,
      displayNameFallback: pick('display_name_fallback') || null,
      notes: pick('notes') || null,
      ...(eventSlugs.length ? { eventSlugs } : {}),
    };
    const validated = guestInputSchema.safeParse(input);
    const invalidChannels = channels.filter((channel) => !(DELIVERY_CHANNELS as readonly string[]).includes(channel));
    const invalidEvents = eventSlugs.filter((slug) => !eventIds.has(slug));
    const message = !validated.success
      ? validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      : maxRaw && !/^\d+$/.test(maxRaw) ? 'max_party_size must be a whole number between 1 and 50.'
        : phoneRaw.length > 40 ? 'phone must contain at most 40 characters.'
          : phoneRaw && (!phone || !/^\+?[\d\s().-]+$/.test(phoneRaw)) ? 'phone must be a phone number, or left blank.'
          : invalidEvents.length ? `Unknown event slug: ${invalidEvents.join(', ')}.`
            : invalidChannels.length ? `Unknown delivery channel: ${invalidChannels.join(', ')}.` : null;
    if (message || !validated.success) {
      results.push(failure({ row, displayName }, message!));
      continue;
    }
    const key = importKey(sortName, phone);
    const duplicate = seen.get(key);
    if (duplicate !== undefined) {
      results.push(failure({ row, displayName }, `Duplicate of row ${duplicate}: same sort_name and phone. Merge the rows or give them distinct identifiers.`));
      continue;
    }
    seen.set(key, row);
    candidates.push({ row, displayName, key, input: validated.data, supplied: new Set(names.keys()), channels: channels as DeliveryChannelName[] });
  }

  for (let index = 0; index < candidates.length; index += BATCH_SIZE) {
    const batch = candidates.slice(index, index + BATCH_SIZE);
    try {
      results.push(...await processBatch(batch, eventIds, dryRun, db));
    } catch (error) {
      if (!isRowDataError(error)) throw error;
      // A database constraint can reject one row in an otherwise valid batch.
      // Roll the batch back first, then isolate the rejected household without
      // sacrificing following rows or leaving half a row committed.
      for (const candidate of batch) {
        try {
          results.push(...await processBatch([candidate], eventIds, dryRun, db));
        } catch (error) {
          if (!isRowDataError(error)) throw error;
          results.push(failure(candidate, 'This row could not be saved. No changes from this row were kept; please retry.'));
        }
      }
    }
  }
  results.sort((a, b) => a.row - b.row);
  return ok({
    created: results.filter((row) => row.status === 'created').length,
    updated: results.filter((row) => row.status === 'updated').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    errors: results.filter((row) => row.status === 'error').length,
    results,
    dryRun,
  });
}

function isRowDataError(error: unknown): boolean {
  // Drizzle wraps PostgreSQL errors in .cause. Only rejected row values should
  // fan out into isolated retries; an outage or schema problem must stop here.
  const visited = new Set<unknown>();
  while (error && typeof error === 'object' && !visited.has(error)) {
    visited.add(error);
    const { code, cause } = error as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && (/^(22|23)/.test(code) || code === 'P0001')) return true;
    error = cause;
  }
  return false;
}

async function processBatch(
  batch: Candidate[],
  eventIds: Map<string, string>,
  dryRun: boolean,
  db: DbLike,
): Promise<ImportRowResult[]> {
  return db.transaction(async (tx) => {
    // Refresh matches AFTER taking this shared import lock. Simultaneous or
    // retried uploads then see the prior commit instead of creating duplicates.
    // Each bounded batch commits independently to keep serverless work small.
    await tx.execute(sql`select pg_advisory_xact_lock(19088743, 918273)`);
    const snapshot = await tx.select().from(guests);
    const keys = new Set(batch.map((candidate) => candidate.key));
    const matchedIds = snapshot.filter((guest) => keys.has(importKey(guest.sortName, guest.phone))).map((guest) => guest.id);
    const locked = matchedIds.length
      ? await tx.select().from(guests).where(inArray(guests.id, matchedIds)).orderBy(asc(guests.id)).for('update')
      : [];
    const replies = locked.length ? await tx.select().from(rsvps).where(inArray(rsvps.guestId, locked.map((guest) => guest.id))) : [];
    const byKey = new Map<string, GuestRow[]>();
    for (const guest of locked) {
      const key = importKey(guest.sortName, guest.phone);
      byKey.set(key, [...(byKey.get(key) ?? []), guest]);
    }
    const results: ImportRowResult[] = [];
    const planned: Planned[] = [];
    for (const candidate of batch) {
      const matches = byKey.get(candidate.key) ?? [];
      if (matches.length > 1) {
        results.push(failure(candidate, 'Multiple existing guests share this sort_name and phone. Resolve the duplicate households in Guests before importing this row.'));
        continue;
      }
      const existing = matches[0];
      if (!existing && snapshot.some((guest) => importKey(guest.sortName, guest.phone) === candidate.key)) {
        results.push(failure(candidate, 'This guest changed during the import. Preview the file again and retry.'));
        continue;
      }
      const input = mergeInput(candidate, existing);
      const invitationIds = input.eventSlugs?.map((slug) => eventIds.get(slug)!);
      if (existing) {
        const checked = validateGuestResponseConstraints(input, replies.filter((reply) => reply.guestId === existing.id), invitationIds);
        if (!checked.ok) {
          results.push(failure(candidate, checked.error.message));
          continue;
        }
      }
      const { eventSlugs: _eventSlugs, ...fields } = input;
      planned.push({ candidate, existing, eventIds: invitationIds, values: {
        ...fields,
        id: existing?.id ?? randomUUID(),
        token: existing?.token ?? generateToken(),
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      } });
    }
    if (!dryRun && planned.length) await saveBatch(planned, tx);
    for (const plan of planned) results.push({
      row: plan.candidate.row,
      displayName: plan.candidate.displayName,
      status: plan.existing ? 'updated' : 'created',
      ...(!dryRun || plan.existing ? { token: plan.values.token } : {}),
    });
    return results;
  });
}

function mergeInput(candidate: Candidate, existing?: GuestRow): GuestInput {
  if (!existing) return candidate.input;
  const { input, supplied } = candidate;
  return {
    ...input,
    // Omitted optional columns preserve manual edits; explicitly blank cells
    // keep the documented defaults or clear nullable text fields.
    displayNameFallback: supplied.has('display_name_fallback') ? input.displayNameFallback : existing.displayNameFallback,
    language: supplied.has('language') ? input.language : existing.language,
    maxPartySize: supplied.has('max_party_size') ? input.maxPartySize : existing.maxPartySize,
    notes: supplied.has('notes') ? input.notes : existing.notes,
  };
}

async function saveBatch(planned: Planned[], tx: Tx) {
  // Never update token/createdAt on conflict. Guest locks serialize updates
  // with manual edits and replies using the same response validation rules.
  await tx.insert(guests).values(planned.map((plan) => plan.values)).onConflictDoUpdate({
    target: guests.id,
    set: {
      displayName: sql`excluded.display_name`, displayNameFallback: sql`excluded.display_name_fallback`,
      sortName: sql`excluded.sort_name`, side: sql`excluded.side`, language: sql`excluded.language`,
      maxPartySize: sql`excluded.max_party_size`, phone: sql`excluded.phone`,
      notes: sql`excluded.notes`, updatedAt: sql`excluded.updated_at`,
    },
  });
  const replacing = planned.filter((plan) => plan.eventIds !== undefined);
  if (replacing.length) {
    await tx.delete(invitations).where(inArray(invitations.guestId, replacing.map((plan) => plan.values.id!)));
    const invitationRows = replacing.flatMap((plan) => plan.eventIds!.map((eventId) => ({ guestId: plan.values.id!, eventId })));
    if (invitationRows.length) await tx.insert(invitations).values(invitationRows);
  }
  const channels = planned.flatMap((plan) => plan.candidate.channels.map((channel) => ({ guestId: plan.values.id!, channel })));
  if (channels.length) await tx.insert(deliveryChannels).values(channels).onConflictDoNothing({ target: [deliveryChannels.guestId, deliveryChannels.channel] });
}
