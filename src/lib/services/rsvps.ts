import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { events, guestMessages, invitations, rsvpHistory, rsvps } from '@/db/schema';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import {
  messageAction,
  normalizeRsvp,
  partyAllowanceFor,
  type NormalizedRsvp,
  type RsvpIntent,
} from '@/lib/domain/rsvp';
import { toRsvpView } from './mappers';
import { lockGuest, withTransaction } from './transactions';
import type { RsvpSource, RsvpView } from './types';

/** PERMANENT. The RSVP write path. */

export type SubmitRsvpInput = {
  responses: RsvpIntent[];
  /** undefined leaves any existing message alone; '' deletes it. */
  message?: string | null;
  source?: RsvpSource;
  recordedBy?: string | null;
};

/** Validation, history and replacement all hold the household's row lock. */
async function saveResponses(
  lookup: { id: string } | { token: string },
  input: SubmitRsvpInput,
  db: DbLike,
): Promise<Result<RsvpView[]>> {
  return withTransaction(db, async (tx) => {
    const guest = await lockGuest(tx, lookup);
    if (!guest) {
      return 'token' in lookup
        ? serviceError('not_found', 'No invitation matches that link.', 'token')
        : serviceError('not_found', 'No such guest.', 'guestId');
    }

    const invited = await tx
      .select({ event: events })
      .from(invitations)
      .innerJoin(events, eq(invitations.eventId, events.id))
      .where(eq(invitations.guestId, guest.id));
    const eventBySlug = new Map(invited.map((row) => [row.event.slug, row.event]));

    const seen = new Set<string>();
    const normalized: { eventId: string; slug: string; values: NormalizedRsvp }[] = [];
    for (const response of input.responses) {
      if (seen.has(response.eventSlug)) {
        return serviceError('validation', `Duplicate response for '${response.eventSlug}'.`, 'responses');
      }
      seen.add(response.eventSlug);
      const event = eventBySlug.get(response.eventSlug);
      if (!event) {
        return serviceError('forbidden', `You are not invited to '${response.eventSlug}'.`, 'eventSlug');
      }
      const result = normalizeRsvp(response, partyAllowanceFor(guest, event), event.name);
      if (!result.ok) return result;
      normalized.push({ eventId: event.id, slug: event.slug, values: result.data });
    }

    const eventIds = normalized.map((entry) => entry.eventId);
    const previous = eventIds.length
      ? await tx.select().from(rsvps)
          .where(and(eq(rsvps.guestId, guest.id), inArray(rsvps.eventId, eventIds)))
      : [];
    const byEvent = new Map(previous.map((row) => [row.eventId, row]));
    const action = messageAction(input.message);
    const source = input.source ?? 'self';
    const recordedBy = input.recordedBy ?? null;
    const now = new Date();
    const results: RsvpView[] = [];

    for (const entry of normalized) {
      const before = byEvent.get(entry.eventId);
      const attendeeNames = entry.values.attendeeNames === undefined
        ? before?.attendeeNames ?? null
        : entry.values.attendeeNames;

      // Retrying the same answer must not manufacture history or move dates.
      // A provenance change is meaningful even when the headcount is unchanged.
      if (before && before.attending === entry.values.attending &&
          before.partyCount === entry.values.partyCount && before.attendeeNames === attendeeNames &&
          before.source === source && before.recordedBy === recordedBy) {
        results.push(toRsvpView(before, entry.slug));
        continue;
      }

      if (before) {
        await tx.insert(rsvpHistory).values({
          guestId: before.guestId,
          eventId: before.eventId,
          attending: before.attending,
          partyCount: before.partyCount,
          attendeeNames: before.attendeeNames,
          source: before.source,
          recordedBy: before.recordedBy,
          supersededAt: now,
        });
      }

      const [row] = await tx.insert(rsvps).values({
        guestId: guest.id,
        eventId: entry.eventId,
        attending: entry.values.attending,
        partyCount: entry.values.partyCount,
        attendeeNames,
        source,
        recordedBy,
      }).onConflictDoUpdate({
        target: [rsvps.guestId, rsvps.eventId],
        set: {
          attending: entry.values.attending,
          partyCount: entry.values.partyCount,
          attendeeNames,
          source,
          recordedBy,
          // submittedAt records the first answer; only updatedAt moves.
          updatedAt: now,
        },
      }).returning();
      if (!row) return serviceError('internal', 'RSVP upsert returned no row.');
      results.push(toRsvpView(row, entry.slug));
    }

    if (action.kind === 'upsert') {
      const [existing] = await tx.select().from(guestMessages)
        .where(eq(guestMessages.guestId, guest.id)).limit(1);
      if (existing?.body !== action.body) {
        await tx.insert(guestMessages).values({ guestId: guest.id, body: action.body })
          .onConflictDoUpdate({
            target: guestMessages.guestId,
            set: { body: action.body, updatedAt: now },
          });
      }
    } else if (action.kind === 'delete') {
      await tx.delete(guestMessages).where(eq(guestMessages.guestId, guest.id));
    }
    return ok(results);
  });
}

export async function submitRsvpByToken(
  token: string,
  input: SubmitRsvpInput,
  db: DbLike = getDb(),
): Promise<Result<RsvpView[]>> {
  return saveResponses({ token }, input, db);
}

/** Proxy entry from /admin/rsvps. Callers set source to 'phone' or 'admin'. */
export async function submitRsvpByGuestId(
  guestId: string,
  input: SubmitRsvpInput,
  db: DbLike = getDb(),
): Promise<Result<RsvpView[]>> {
  return saveResponses({ id: guestId }, input, db);
}
