import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { events, guestMessages, invitations, rsvps } from '@/db/schema';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import {
  messageAction,
  normalizeRsvp,
  partyAllowanceFor,
  type NormalizedRsvp,
  type RsvpIntent,
} from '@/lib/domain/rsvp';
import { findGuestByToken, getGuestById } from './guests';
import { toRsvpView } from './mappers';
import type { GuestView, RsvpSource, RsvpView } from './types';

/** PERMANENT. The RSVP write path. */

export type SubmitRsvpInput = {
  responses: RsvpIntent[];
  /** undefined leaves any existing message alone; '' deletes it. */
  message?: string | null;
  source?: RsvpSource;
  recordedBy?: string | null;
};

/**
 * Validates and persists a set of responses for one guest.
 *
 * Every rule is re-checked here against the guest's own record, whatever the
 * request claimed. Writes happen in a single transaction, so a request that
 * fails validation on its second event leaves nothing behind from its first.
 */
async function saveResponses(
  guest: GuestView,
  input: SubmitRsvpInput,
): Promise<Result<RsvpView[]>> {
  const db = getDb();

  // Which events is this guest actually invited to?
  const invited = await db
    .select({ event: events })
    .from(invitations)
    .innerJoin(events, eq(invitations.eventId, events.id))
    .where(eq(invitations.guestId, guest.id));

  const eventBySlug = new Map(invited.map((row) => [row.event.slug, row.event]));

  // A repeated slug in one payload would mean two conflicting upserts against
  // the same row in a single transaction.
  const seen = new Set<string>();
  for (const response of input.responses) {
    if (seen.has(response.eventSlug)) {
      return serviceError(
        'validation',
        `Duplicate response for '${response.eventSlug}'.`,
        'responses',
      );
    }
    seen.add(response.eventSlug);
  }

  // Invariant 5: only events the guest holds an invitation for. 403, not 404 -
  // the event exists, this guest simply may not answer for it.
  for (const response of input.responses) {
    if (!eventBySlug.has(response.eventSlug)) {
      return serviceError(
        'forbidden',
        `You are not invited to '${response.eventSlug}'.`,
        'eventSlug',
      );
    }
  }

  // Invariant 3: party size, validated server side.
  const normalized: { eventId: string; slug: string; values: NormalizedRsvp }[] = [];
  for (const response of input.responses) {
    const event = eventBySlug.get(response.eventSlug)!;
    const allowance = partyAllowanceFor(guest, event);
    const result = normalizeRsvp(response, allowance, event.name);
    if (!result.ok) return result;
    normalized.push({ eventId: event.id, slug: event.slug, values: result.data });
  }

  const action = messageAction(input.message);
  const source = input.source ?? 'self';
  const recordedBy = input.recordedBy ?? null;
  const now = new Date();

  // Invariant 4: upsert. Never a duplicate row, never a hard delete.
  const saved = await db.transaction(async (tx) => {
    const results: RsvpView[] = [];

    for (const entry of normalized) {
      const [row] = await tx
        .insert(rsvps)
        .values({
          guestId: guest.id,
          eventId: entry.eventId,
          attending: entry.values.attending,
          partyCount: entry.values.partyCount,
          attendeeNames: entry.values.attendeeNames,
          source,
          recordedBy,
        })
        .onConflictDoUpdate({
          target: [rsvps.guestId, rsvps.eventId],
          set: {
            attending: entry.values.attending,
            partyCount: entry.values.partyCount,
            attendeeNames: entry.values.attendeeNames,
            source,
            recordedBy,
            // submittedAt deliberately untouched: it records the FIRST answer.
            updatedAt: now,
          },
        })
        .returning();

      if (row) results.push(toRsvpView(row, entry.slug));
    }

    if (action.kind === 'upsert') {
      await tx
        .insert(guestMessages)
        .values({ guestId: guest.id, body: action.body })
        .onConflictDoUpdate({
          target: guestMessages.guestId,
          set: { body: action.body, updatedAt: now },
        });
    } else if (action.kind === 'delete') {
      await tx.delete(guestMessages).where(eq(guestMessages.guestId, guest.id));
    }

    return results;
  });

  return ok(saved);
}

export async function submitRsvpByToken(
  token: string,
  input: SubmitRsvpInput,
): Promise<Result<RsvpView[]>> {
  const guest = await findGuestByToken(token);
  if (!guest) return serviceError('not_found', 'No invitation matches that link.', 'token');
  return saveResponses(guest, input);
}

/** Proxy entry from /admin/rsvps. Callers set source to 'phone' or 'admin'. */
export async function submitRsvpByGuestId(
  guestId: string,
  input: SubmitRsvpInput,
): Promise<Result<RsvpView[]>> {
  const guest = await getGuestById(guestId);
  if (!guest) return serviceError('not_found', 'No such guest.', 'guestId');
  return saveResponses(guest, input);
}
