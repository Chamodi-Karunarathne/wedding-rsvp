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
import { importKey, normalizePhones, phoneListError, splitPhoneNumbers } from '@/lib/domain/phone';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import { validateGuestResponseConstraints, type GuestInput } from './guests';
import type { DeliveryChannelName } from './types';

/** CSV import never replaces invitation tokens, responses or delivery progress. */
export type ImportRowResult = {
  /** Physical CSV starting line, including the header and multiline fields. */
  row: number;
  status: 'created' | 'updated' | 'duplicate' | 'skipped' | 'error';
  displayName: string;
  message?: string;
  token?: string;
  warnings?: string[];
  duplicate?: ImportDuplicate;
  action?: ImportDuplicateAction;
};

export type ImportDuplicateAction = 'update' | 'replace' | 'discard';
export type ImportDecision = {
  row: number;
  guestId: string;
  updatedAt: string;
  action: ImportDuplicateAction;
};
export type ImportDuplicate = {
  guestId: string;
  updatedAt: string;
  displayName: string;
  phone: string | null;
};

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  duplicates: number;
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
  nonBlank: Set<Column>;
  channels: DeliveryChannelName[];
};
type Planned = {
  candidate: Candidate;
  existing?: GuestRow;
  values: NewGuestRow;
  eventIds?: string[];
  action?: ImportDuplicateAction;
  warnings: string[];
  removeChannelIds: string[];
};
const BATCH_SIZE = 25;
const canonicalHeader = (header: string) => header.replace(/[ _]/g, '');
const splitList = (value: string) => [...new Set(value.split(/[;,|]/).map((v) => v.trim()).filter(Boolean))];
const failure = (candidate: Pick<Candidate, 'row' | 'displayName'>, message: string): ImportRowResult =>
  ({ row: candidate.row, status: 'error', displayName: candidate.displayName, message });

/** Validate the complete file before starting any writes. */
export async function importGuestsCsv(
  csv: string,
  options: { defaultEventSlugs?: string[]; dryRun?: boolean; decisions?: ImportDecision[] } = {},
  db: DbLike = getDb(),
): Promise<Result<ImportSummary>> {
  const dryRun = options.dryRun ?? false;
  const decisions = new Map<number, ImportDecision>();
  for (const decision of options.decisions ?? []) {
    if (decisions.has(decision.row)) return serviceError('validation', 'Choose only one duplicate action per CSV row.', 'decisions');
    decisions.set(decision.row, decision);
  }
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
    const phone = normalizePhones(phoneRaw);
    const slugs = splitList(pick('events'));
    const eventSlugs = slugs.length ? slugs : defaultSlugs;
    const channels = [...new Set(splitList(pick('channels')).map((channel) => channel.toLowerCase()))];
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
    const phoneError = phoneListError(phoneRaw);
    const message = !validated.success
      ? validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      : maxRaw && !/^\d+$/.test(maxRaw) ? 'max_party_size must be a whole number between 1 and 50.'
        : phoneError ? phoneError
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
    candidates.push({ row, displayName, key, input: validated.data, supplied: new Set(names.keys()),
      nonBlank: new Set([...names.keys()].filter((name) => pick(name) !== '')),
      channels: channels as DeliveryChannelName[] });
  }

  const summarize = () => ok({
    created: results.filter((row) => row.status === 'created').length,
    updated: results.filter((row) => row.status === 'updated').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    errors: results.filter((row) => row.status === 'error').length,
    duplicates: results.filter((row) => row.status === 'duplicate').length,
    results: results.sort((a, b) => a.row - b.row),
    dryRun,
  });
  if (!candidates.length) return summarize();

  const process = async (database: DbLike) => {
    const seenExisting = new Map<string, number>();
    const record = (rows: ImportRowResult[]) => {
      results.push(...rows);
      for (const row of rows) {
        if (row.duplicate && row.status !== 'error') seenExisting.set(row.duplicate.guestId, row.row);
      }
    };
    for (let index = 0; index < candidates.length; index += BATCH_SIZE) {
      const batch = candidates.slice(index, index + BATCH_SIZE);
      try {
        record(await processBatch(batch, eventIds, dryRun, decisions, seenExisting, database));
      } catch (error) {
        if (!isRowDataError(error)) throw error;
        // Failed batch savepoints roll back before rejected rows are isolated.
        for (const candidate of batch) {
          try {
            record(await processBatch([candidate], eventIds, dryRun, decisions, seenExisting, database));
          } catch (error) {
            if (!isRowDataError(error)) throw error;
            results.push(failure(candidate, 'This row could not be saved. No changes from this row were kept; please retry.'));
          }
        }
      }
    }
    return summarize();
  };
  if (dryRun) return process(db);
  // Hold the shared import/clear lock until the complete upload commits. Batch
  // savepoints retain row isolation without allowing a clear between batches.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(19088743, 918273)`);
    return process(tx);
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
  decisions: Map<number, ImportDecision>,
  seenExisting: Map<string, number>,
  db: DbLike,
): Promise<ImportRowResult[]> {
  return db.transaction(async (tx) => {
    // Refresh matches AFTER taking this shared import lock. Simultaneous or
    // retried uploads then see the prior commit instead of creating duplicates.
    // Apply holds this lock across all batch savepoints. Preview takes it only
    // while reading each batch and never writes application records.
    await tx.execute(sql`select pg_advisory_xact_lock(19088743, 918273)`);
    const snapshot = await tx.select().from(guests);
    const names = new Set(batch.map((candidate) => matchingName(candidate.input.sortName)));
    const matchedIds = snapshot.filter((guest) => names.has(matchingName(guest.sortName))).map((guest) => guest.id);
    const locked = matchedIds.length
      ? await tx.select().from(guests).where(inArray(guests.id, matchedIds)).orderBy(asc(guests.id)).for('update')
      : [];
    const ids = locked.map((guest) => guest.id);
    // One checked-out transaction client executes these reads in order.
    const replies = ids.length ? await tx.select().from(rsvps).where(inArray(rsvps.guestId, ids)) : [];
    const assigned = ids.length ? await tx.select().from(invitations).where(inArray(invitations.guestId, ids)) : [];
    const sentChannels = ids.length ? await tx.select().from(deliveryChannels).where(inArray(deliveryChannels.guestId, ids)) : [];
    const results: ImportRowResult[] = [];
    const planned: Planned[] = [];
    const claimed = new Map(seenExisting);
    for (const candidate of batch) {
      const matches = findMatches(candidate, locked);
      if (matches.length > 1) {
        results.push(failure(candidate, 'Multiple existing guests share this sort_name and phone. Resolve the duplicate households in Guests before importing this row.'));
        continue;
      }
      const existing = matches[0];
      if (!existing && findMatches(candidate, snapshot).length) {
        results.push(failure(candidate, 'This guest changed during the import. Preview the file again and retry.'));
        continue;
      }
      const decision = decisions.get(candidate.row);
      const duplicate = existing ? duplicateInfo(existing) : undefined;
      if (decision && (!existing || decision.guestId !== existing.id || decision.updatedAt !== existing.updatedAt.toISOString())) {
        results.push({ ...failure(candidate, 'This guest changed after the preview. Check the CSV again before choosing an action.'), ...(duplicate ? { duplicate } : {}) });
        continue;
      }
      if (existing && claimed.has(existing.id)) {
        results.push(failure(candidate, `This row matches the same existing household as row ${claimed.get(existing.id)}. Merge those CSV rows first.`));
        continue;
      }
      const oldChannels = existing ? sentChannels.filter((channel) => channel.guestId === existing.id) : [];
      if (existing && !decision) {
        results.push({ row: candidate.row, displayName: candidate.displayName, status: 'duplicate', duplicate,
          message: 'Existing household found. Choose Update, Replace or Discard before importing this entry.',
          warnings: missingPhoneWarning(existing.phone, oldChannels.map((channel) => channel.channel)),
        });
        claimed.set(existing.id, candidate.row);
        continue;
      }
      if (existing && decision?.action === 'discard') {
        results.push({ row: candidate.row, displayName: candidate.displayName,
          status: dryRun ? 'duplicate' : 'skipped', duplicate, action: 'discard',
          token: existing.token, message: 'Keep the existing household unchanged.',
          warnings: missingPhoneWarning(existing.phone, oldChannels.map((channel) => channel.channel)),
        });
        claimed.set(existing.id, candidate.row);
        continue;
      }
      const action = decision?.action;
      const merged = guestInputSchema.safeParse(mergeInput(candidate, existing, action));
      // Individually valid incoming/stored phone lists can exceed the storage
      // input limit when Update unions them. Validate the final editable value.
      if (!merged.success) {
        results.push({ ...failure(candidate, merged.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')), duplicate, action });
        continue;
      }
      const input = merged.data;
      const originalIds = existing ? assigned.filter((row) => row.guestId === existing.id).map((row) => row.eventId) : [];
      const incomingIds = input.eventSlugs?.map((slug) => eventIds.get(slug)!);
      const invitationIds = existing && action === 'update'
        ? [...new Set([...originalIds, ...(incomingIds ?? [])])]
        : existing && action === 'replace' ? incomingIds ?? [] : incomingIds;
      if (existing) {
        const checked = validateGuestResponseConstraints(input, replies.filter((reply) => reply.guestId === existing.id), invitationIds);
        if (!checked.ok) {
          results.push({ ...failure(candidate, checked.error.message), duplicate, action });
          continue;
        }
      }
      const { eventSlugs: _eventSlugs, ...fields } = input;
      const finalChannels = existing && action === 'update'
        ? [...new Set([...oldChannels.map((channel) => channel.channel), ...candidate.channels])]
        : candidate.channels;
      planned.push({ candidate, existing, action, eventIds: invitationIds,
        warnings: missingPhoneWarning(input.phone, finalChannels),
        removeChannelIds: action === 'replace' ? oldChannels.filter((channel) => !candidate.channels.includes(channel.channel)).map((channel) => channel.id) : [],
        values: {
        ...fields,
        id: existing?.id ?? randomUUID(),
        token: existing?.token ?? generateToken(),
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      } });
      if (existing) claimed.set(existing.id, candidate.row);
    }
    if (!dryRun && planned.length) await saveBatch(planned, tx);
    for (const plan of planned) results.push({
      row: plan.candidate.row,
      displayName: plan.candidate.displayName,
      status: plan.existing ? (dryRun ? 'duplicate' : 'updated') : 'created',
      ...(plan.existing ? { duplicate: duplicateInfo(plan.existing), action: plan.action } : {}),
      ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
      ...(!dryRun || plan.existing ? { token: plan.values.token } : {}),
    });
    return results;
  });
}

function matchingName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findMatches(candidate: Candidate, rows: GuestRow[]): GuestRow[] {
  const exact = rows.filter((guest) => importKey(guest.sortName, guest.phone) === candidate.key);
  if (exact.length) return exact;
  const phones = splitPhoneNumbers(candidate.input.phone);
  return rows.filter((guest) => {
    if (matchingName(guest.sortName) !== matchingName(candidate.input.sortName)) return false;
    const stored = splitPhoneNumbers(guest.phone);
    return !phones.length || !stored.length || phones.some((phone) => stored.includes(phone));
  });
}

function duplicateInfo(guest: GuestRow): ImportDuplicate {
  return { guestId: guest.id, updatedAt: guest.updatedAt.toISOString(), displayName: guest.displayName, phone: guest.phone };
}

function missingPhoneWarning(phone: string | null | undefined, channels: DeliveryChannelName[]): string[] {
  return channels.includes('whatsapp') && !splitPhoneNumbers(phone).length
    ? ['WhatsApp needs a phone number. This guest will be registered; add a number or change the sending channel.'] : [];
}

function mergeInput(candidate: Candidate, existing?: GuestRow, action?: ImportDuplicateAction): GuestInput {
  if (!existing || action === 'replace') return candidate.input;
  const { input, nonBlank } = candidate;
  return {
    ...input,
    sortName: nonBlank.has('sort_name') ? input.sortName : existing.sortName,
    phone: nonBlank.has('phone')
      ? normalizePhones([...splitPhoneNumbers(existing.phone), ...splitPhoneNumbers(input.phone)].join(','))
      : existing.phone,
    displayNameFallback: nonBlank.has('display_name_fallback') ? input.displayNameFallback : existing.displayNameFallback,
    language: nonBlank.has('language') ? input.language : existing.language,
    maxPartySize: nonBlank.has('max_party_size') ? input.maxPartySize : existing.maxPartySize,
    notes: nonBlank.has('notes') ? input.notes : existing.notes,
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
  const removeChannelIds = planned.flatMap((plan) => plan.removeChannelIds);
  if (removeChannelIds.length) await tx.delete(deliveryChannels).where(inArray(deliveryChannels.id, removeChannelIds));
  const replacing = planned.filter((plan) => plan.eventIds !== undefined);
  if (replacing.length) {
    await tx.delete(invitations).where(inArray(invitations.guestId, replacing.map((plan) => plan.values.id!)));
    const invitationRows = replacing.flatMap((plan) => plan.eventIds!.map((eventId) => ({ guestId: plan.values.id!, eventId })));
    if (invitationRows.length) await tx.insert(invitations).values(invitationRows);
  }
  const channels = planned.flatMap((plan) => plan.candidate.channels.map((channel) => ({ guestId: plan.values.id!, channel })));
  if (channels.length) await tx.insert(deliveryChannels).values(channels).onConflictDoNothing({ target: [deliveryChannels.guestId, deliveryChannels.channel] });
}
