import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, type DbLike, type Tx } from '@/db/client';
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
import { listOpens } from './opens';
import { lockGuest, withTransaction } from './transactions';
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
  notes?: string | null;
  /** Event slugs this guest is invited to. Replaces the existing set. */
  eventSlugs?: string[];
};

export async function createGuest(
  input: GuestInput,
  db: DbLike = getDb(),
): Promise<Result<GuestView>> {
  return withTransaction(db, async (tx) => {
    const planned = input.eventSlugs !== undefined
      ? await resolveInvitations(input.eventSlugs, tx)
      : ok(null);
    if (!planned.ok) return planned;

    const ids = await allocateToken(tx);
    if (!ids.ok) return ids;

    const [row] = await tx
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
        notes: input.notes ?? null,
      })
      .returning();

    if (!row) return serviceError('internal', 'Guest insert returned no row.');
    if (planned.data) await replaceInvitations(row.id, planned.data.eventIds, tx);
    return ok(toGuestView(row));
  });
}

export async function updateGuest(
  guestId: string,
  input: Partial<GuestInput>,
  db: DbLike = getDb(),
): Promise<Result<GuestView>> {
  return withTransaction(db, async (tx) => {
    const prepared = await prepareGuestUpdate(guestId, input, tx);
    if (!prepared.ok) return prepared;

    const [row] = await tx
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
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: new Date(),
      })
      .where(eq(guests.id, guestId))
      .returning();

    if (!row) return serviceError('not_found', 'No such guest.');
    if (prepared.data.invitations) {
      await replaceInvitations(guestId, prepared.data.invitations.eventIds, tx);
    }
    return ok(toGuestView(row));
  });
}

type InvitationPlan = { slugs: string[]; eventIds: string[] };

async function resolveInvitations(eventSlugs: string[], db: DbLike): Promise<Result<InvitationPlan>> {
  const slugs = [...new Set(eventSlugs)];
  const rows = slugs.length ? await db.select().from(events).where(inArray(events.slug, slugs)) : [];
  const missing = slugs.filter((slug) => !rows.some((event) => event.slug === slug));
  if (missing.length) {
    return serviceError('validation', `Unknown event slug: ${missing.join(', ')}.`, 'eventSlugs');
  }
  return ok({ slugs, eventIds: rows.map((event) => event.id) });
}

async function prepareGuestUpdate(guestId: string, input: Partial<GuestInput>, tx: Tx) {
  const guest = await lockGuest(tx, { id: guestId });
  if (!guest) return serviceError('not_found', 'No such guest.');

  const plan = input.eventSlugs !== undefined
    ? await resolveInvitations(input.eventSlugs, tx)
    : ok(null);
  if (!plan.ok) return plan;

  const responses = input.maxPartySize !== undefined || plan.data
    ? await tx.select().from(rsvps).where(eq(rsvps.guestId, guestId))
    : [];
  const allowance = input.maxPartySize;
  if (allowance !== undefined && responses.some((reply) => reply.attending && reply.partyCount > allowance)) {
    return serviceError(
      'conflict',
      'This guest has already confirmed more people than the proposed invitation allows. ' +
        'Adjust their response in Record a response before reducing the assigned places.',
      'maxPartySize',
    );
  }
  const invitationPlan = plan.data;
  if (invitationPlan && responses.some((reply) => !invitationPlan.eventIds.includes(reply.eventId))) {
    return serviceError(
      'conflict',
      'This guest has already responded to an event you are removing. Keep that event on their invitation.',
      'eventSlugs',
    );
  }
  return ok({ guest, invitations: plan.data });
}

/** The CSV preview and save share the same validation under the guest lock. */
export async function validateGuestUpdate(
  guestId: string,
  input: Partial<GuestInput>,
  db: DbLike = getDb(),
): Promise<Result<GuestView>> {
  return withTransaction(db, async (tx) => {
    const prepared = await prepareGuestUpdate(guestId, input, tx);
    return prepared.ok ? ok(toGuestView(prepared.data.guest)) : prepared;
  });
}

export async function validateGuestCreate(
  input: GuestInput,
  db: DbLike = getDb(),
): Promise<Result<true>> {
  const plan = await resolveInvitations(input.eventSlugs ?? [], db);
  return plan.ok ? ok(true) : plan;
}

async function replaceInvitations(guestId: string, eventIds: string[], tx: Tx): Promise<void> {
  await tx.delete(invitations).where(eq(invitations.guestId, guestId));
  if (eventIds.length) {
    await tx.insert(invitations).values(eventIds.map((eventId) => ({ guestId, eventId })));
  }
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
  return withTransaction(db, async (tx) => {
    const prepared = await prepareGuestUpdate(guestId, { eventSlugs }, tx);
    if (!prepared.ok) return prepared;
    const plan = prepared.data.invitations;
    if (!plan) return serviceError('internal', 'Invitation plan was not prepared.');
    await replaceInvitations(guestId, plan.eventIds, tx);
    return ok(plan.slugs);
  });
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
  /** When they first loaded their invitation. Null means they never have. */
  firstOpen: Date | null;
  lastOpen: Date | null;
};

/** Full admin listing. 500 guests is small enough to assemble in five queries
 *  rather than one join that fans out. */
export async function listGuests(db: DbLike = getDb()): Promise<GuestListRow[]> {
  const guestRows = await db.select().from(guests).orderBy(asc(guests.sortName));
  if (guestRows.length === 0) return [];

  const [invitationRows, rsvpRows, channelRows, messageRows, opens] = await Promise.all([
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
    listOpens(db),
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

  return guestRows.map((row) => {
    const open = opens.get(row.id);

    return {
      guest: toGuestView(row),
      eventSlugs: (slugsByGuest.get(row.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => e.slug),
      rsvps: rsvpsByGuest.get(row.id) ?? [],
      channels: channelsByGuest.get(row.id) ?? [],
      message: messageByGuest.get(row.id) ?? null,
      firstOpen: open?.firstOpen ?? null,
      lastOpen: open?.lastOpen ?? null,
    };
  });
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

/** CSV channel membership never changes an existing sending record. */
export async function ensureDeliveryChannels(
  guestId: string,
  channels: DeliveryChannelView['channel'][],
  db: DbLike = getDb(),
): Promise<void> {
  const unique = [...new Set(channels)];
  if (!unique.length) return;
  await db.insert(deliveryChannels)
    .values(unique.map((channel) => ({ guestId, channel })))
    .onConflictDoNothing({ target: [deliveryChannels.guestId, deliveryChannels.channel] });
}

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
