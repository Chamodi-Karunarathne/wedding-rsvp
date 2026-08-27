import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import {
  deliveryChannels,
  events,
  guestMessages,
  guests,
  invitations,
  rsvps,
} from '@/db/schema';
import { generateToken } from '@/lib/domain/ids';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import { toDeliveryChannelView, toEventView, toGuestView, toRsvpView } from './mappers';
import type { DeliveryChannelView, EventView, GuestView, RsvpView, Side } from './types';

/** PERMANENT. Guest reads and writes. */

/* -------------------------------------------------------------------------- */
/* lookup                                                                     */
/* -------------------------------------------------------------------------- */

export async function findGuestByToken(
  token: string,
  db: DbLike = getDb(),
): Promise<GuestView | null> {
  const [row] = await db.select().from(guests).where(eq(guests.token, token)).limit(1);
  return row ? toGuestView(row) : null;
}

/* -------------------------------------------------------------------------- */
/* invitations and responses                                                  */
/* -------------------------------------------------------------------------- */

/** The events this guest holds an invitations row for, in sort order. */
export async function listInvitedEvents(
  guestId: string,
  db: DbLike = getDb(),
): Promise<EventView[]> {
  const rows = await db
    .select({ event: events })
    .from(invitations)
    .innerJoin(events, eq(invitations.eventId, events.id))
    .where(eq(invitations.guestId, guestId))
    .orderBy(asc(events.sortOrder), asc(events.startsAt));

  return rows.map((row) => toEventView(row.event));
}

export async function listRsvpsForGuest(
  guestId: string,
  db: DbLike = getDb(),
): Promise<RsvpView[]> {
  const rows = await db
    .select({ rsvp: rsvps, slug: events.slug })
    .from(rsvps)
    .innerJoin(events, eq(rsvps.eventId, events.id))
    .where(eq(rsvps.guestId, guestId));

  return rows.map((row) => toRsvpView(row.rsvp, row.slug));
}

export async function getGuestMessage(
  guestId: string,
  db: DbLike = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(guestMessages)
    .where(eq(guestMessages.guestId, guestId))
    .limit(1);
  return row?.body ?? null;
}

export async function listDeliveryChannels(
  guestId: string,
  db: DbLike = getDb(),
): Promise<DeliveryChannelView[]> {
  const rows = await db
    .select()
    .from(deliveryChannels)
    .where(eq(deliveryChannels.guestId, guestId));
  return rows.map(toDeliveryChannelView);
}

/* -------------------------------------------------------------------------- */
/* unique identifier allocation                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reserves a token that is not already taken.
 *
 * The odds of a collision at 500 guests are negligible, but "negligible" is
 * not "impossible" and a duplicate token would send two households to one
 * invitation. Checked rather than assumed.
 */
export async function allocateToken(
  db: DbLike = getDb(),
  attempts = 20,
): Promise<Result<{ token: string }>> {
  for (let i = 0; i < attempts; i += 1) {
    const token = generateToken();

    const clash = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.token, token))
      .limit(1);

    if (clash.length === 0) return ok({ token });
  }

  return serviceError(
    'internal',
    `Could not allocate a unique token after ${attempts} attempts.`,
  );
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                       */
/* -------------------------------------------------------------------------- */

export type GuestInput = {
  displayName: string;
  displayNameFallback?: string | null;
  sortName: string;
  side: Side;
  language?: 'en' | 'si';
  maxPartySize?: number;
  phone?: string | null;
  personalNote?: string | null;
  notes?: string | null;
  /** Event slugs this guest is invited to. Replaces the existing set. */
  eventSlugs?: string[];
};

export async function createGuest(
  input: GuestInput,
  db: DbLike = getDb(),
): Promise<Result<GuestView>> {
  const ids = await allocateToken(db);
  if (!ids.ok) return ids;

  const [row] = await db
    .insert(guests)
    .values({
      token: ids.data.token,
      displayName: input.displayName,
      displayNameFallback: input.displayNameFallback ?? null,
      sortName: input.sortName,
      side: input.side,
      language: input.language ?? 'en',
      maxPartySize: input.maxPartySize ?? 2,
      phone: input.phone ?? null,
      personalNote: input.personalNote ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  if (!row) return serviceError('internal', 'Guest insert returned no row.');

  if (input.eventSlugs) {
    const result = await setInvitations(row.id, input.eventSlugs, db);
    if (!result.ok) return result;
  }

  return ok(toGuestView(row));
}

export async function updateGuest(
  guestId: string,
  input: Partial<GuestInput>,
  db: DbLike = getDb(),
): Promise<Result<GuestView>> {
  const [row] = await db
    .update(guests)
    .set({
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.displayNameFallback !== undefined && {
        displayNameFallback: input.displayNameFallback,
      }),
      ...(input.sortName !== undefined && { sortName: input.sortName }),
      ...(input.side !== undefined && { side: input.side }),
      ...(input.language !== undefined && { language: input.language }),
      ...(input.maxPartySize !== undefined && { maxPartySize: input.maxPartySize }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.personalNote !== undefined && { personalNote: input.personalNote }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(guests.id, guestId))
    .returning();

  if (!row) return serviceError('not_found', 'No such guest.');

  if (input.eventSlugs) {
    const result = await setInvitations(guestId, input.eventSlugs, db);
    if (!result.ok) return result;
  }

  return ok(toGuestView(row));
}

/**
 * Replaces a guest's invitation set.
 *
 * Removing an invitation the guest has already responded to is refused rather
 * than silently cascading the RSVP away - that would destroy a real answer.
 */
export async function setInvitations(
  guestId: string,
  eventSlugs: string[],
  db: DbLike = getDb(),
): Promise<Result<string[]>> {
  const wanted = [...new Set(eventSlugs)];

  const eventRows = wanted.length
    ? await db.select().from(events).where(inArray(events.slug, wanted))
    : [];

  const missing = wanted.filter((slug) => !eventRows.some((e) => e.slug === slug));
  if (missing.length) {
    return serviceError('validation', `Unknown event slug: ${missing.join(', ')}.`, 'eventSlugs');
  }

  const keepIds = eventRows.map((e) => e.id);

  const existingRsvps = await db
    .select({ eventId: rsvps.eventId })
    .from(rsvps)
    .where(eq(rsvps.guestId, guestId));

  const wouldDrop = existingRsvps.filter((r) => !keepIds.includes(r.eventId));
  if (wouldDrop.length) {
    return serviceError(
      'conflict',
      'This guest has already responded to an event you are removing. ' +
        'Delete the response first if that is really intended.',
      'eventSlugs',
    );
  }

  await db.delete(invitations).where(eq(invitations.guestId, guestId));
  if (keepIds.length) {
    await db.insert(invitations).values(keepIds.map((eventId) => ({ guestId, eventId })));
  }

  return ok(wanted);
}

export async function deleteGuest(
  guestId: string,
  db: DbLike = getDb(),
): Promise<Result<{ id: string }>> {
  const deleted = await db.delete(guests).where(eq(guests.id, guestId)).returning({
    id: guests.id,
  });
  const row = deleted[0];
  if (!row) return serviceError('not_found', 'No such guest.');
  return ok({ id: row.id });
}

/* -------------------------------------------------------------------------- */
/* listing                                                                    */
/* -------------------------------------------------------------------------- */

export type GuestListRow = {
  guest: GuestView;
  eventSlugs: string[];
  rsvps: RsvpView[];
  channels: DeliveryChannelView[];
  message: string | null;
};

/** Full admin listing. 500 guests is small enough to assemble in four queries
 *  rather than one join that fans out. */
export async function listGuests(db: DbLike = getDb()): Promise<GuestListRow[]> {
  const guestRows = await db.select().from(guests).orderBy(asc(guests.sortName));
  if (guestRows.length === 0) return [];

  const [invitationRows, rsvpRows, channelRows, messageRows] = await Promise.all([
    db
      .select({ guestId: invitations.guestId, slug: events.slug, sortOrder: events.sortOrder })
      .from(invitations)
      .innerJoin(events, eq(invitations.eventId, events.id)),
    db
      .select({ rsvp: rsvps, slug: events.slug })
      .from(rsvps)
      .innerJoin(events, eq(rsvps.eventId, events.id)),
    db.select().from(deliveryChannels),
    db.select().from(guestMessages),
  ]);

  const slugsByGuest = new Map<string, { slug: string; sortOrder: number }[]>();
  for (const row of invitationRows) {
    const list = slugsByGuest.get(row.guestId) ?? [];
    list.push({ slug: row.slug, sortOrder: row.sortOrder });
    slugsByGuest.set(row.guestId, list);
  }

  const rsvpsByGuest = new Map<string, RsvpView[]>();
  for (const row of rsvpRows) {
    const list = rsvpsByGuest.get(row.rsvp.guestId) ?? [];
    list.push(toRsvpView(row.rsvp, row.slug));
    rsvpsByGuest.set(row.rsvp.guestId, list);
  }

  const channelsByGuest = new Map<string, DeliveryChannelView[]>();
  for (const row of channelRows) {
    const list = channelsByGuest.get(row.guestId) ?? [];
    list.push(toDeliveryChannelView(row));
    channelsByGuest.set(row.guestId, list);
  }

  const messageByGuest = new Map(messageRows.map((row) => [row.guestId, row.body]));

  return guestRows.map((row) => ({
    guest: toGuestView(row),
    eventSlugs: (slugsByGuest.get(row.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((e) => e.slug),
    rsvps: rsvpsByGuest.get(row.id) ?? [],
    channels: channelsByGuest.get(row.id) ?? [],
    message: messageByGuest.get(row.id) ?? null,
  }));
}

export async function getGuestById(
  guestId: string,
  db: DbLike = getDb(),
): Promise<GuestView | null> {
  const [row] = await db.select().from(guests).where(eq(guests.id, guestId)).limit(1);
  return row ? toGuestView(row) : null;
}

/* -------------------------------------------------------------------------- */
/* delivery channels                                                          */
/* -------------------------------------------------------------------------- */

export async function setDeliveryChannel(
  guestId: string,
  channel: 'whatsapp' | 'print' | 'in_person',
  patch: { status?: 'pending' | 'sent' | 'delivered'; sentBy?: string | null; notes?: string | null },
  db: DbLike = getDb(),
): Promise<Result<DeliveryChannelView>> {
  const status = patch.status ?? 'pending';
  const sentAt = status === 'pending' ? null : new Date();

  const [row] = await db
    .insert(deliveryChannels)
    .values({
      guestId,
      channel,
      status,
      sentAt,
      sentBy: patch.sentBy ?? null,
      notes: patch.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [deliveryChannels.guestId, deliveryChannels.channel],
      set: {
        status,
        sentAt,
        sentBy: patch.sentBy ?? null,
        ...(patch.notes !== undefined && { notes: patch.notes }),
      },
    })
    .returning();

  if (!row) return serviceError('internal', 'Delivery channel upsert returned no row.');
  return ok(toDeliveryChannelView(row));
}

export async function removeDeliveryChannel(
  guestId: string,
  channel: 'whatsapp' | 'print' | 'in_person',
  db: DbLike = getDb(),
): Promise<Result<{ ok: true }>> {
  await db
    .delete(deliveryChannels)
    .where(and(eq(deliveryChannels.guestId, guestId), eq(deliveryChannels.channel, channel)));
  return ok({ ok: true });
}
