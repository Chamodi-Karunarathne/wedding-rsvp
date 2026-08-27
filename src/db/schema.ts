import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * PERMANENT. This schema outlives the guest UI.
 *
 * Constrained string columns are `text` + a CHECK constraint rather than a
 * Postgres enum, because altering an enum in a migration is painful and these
 * value sets are more likely to grow than not. The TS union comes from
 * drizzle's `enum` option, which is a type-level hint only.
 */

export const SIDES = ['bride', 'groom', 'both'] as const;
export const LOCALES = ['en', 'si'] as const;
export const RSVP_SOURCES = ['self', 'admin', 'phone'] as const;
export const DELIVERY_CHANNELS = ['whatsapp', 'print', 'in_person'] as const;
export const DELIVERY_STATUSES = ['pending', 'sent', 'delivered'] as const;

export type Side = (typeof SIDES)[number];
export type Locale = (typeof LOCALES)[number];
export type RsvpSource = (typeof RSVP_SOURCES)[number];
export type DeliveryChannelName = (typeof DELIVERY_CHANNELS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

/* -------------------------------------------------------------------------- */
/* events                                                                     */
/* -------------------------------------------------------------------------- */

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  venueName: text('venue_name').notNull(),
  venueAddress: text('venue_address').notNull(),
  // Nullable: both are genuinely optional and neither is load-bearing.
  mapUrl: text('map_url'),
  dressCode: text('dress_code'),
  sortOrder: integer('sort_order').notNull().default(0),
});

/* -------------------------------------------------------------------------- */
/* guests                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One row per INVITATION, never per person and never per delivery channel.
 * "Mr. & Mrs. Perera, party of 2" is a single row with max_party_size = 2.
 * A guest who gets both a printed card and a WhatsApp message is still one
 * row, with two delivery_channels rows.
 */
export const guests = pgTable(
  'guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // nanoid(10), used in links, never typed by a human.
    token: text('token').notNull().unique(),
    displayName: text('display_name').notNull(),
    // Shorter form for the fixed-width card design, where a long display
    // name breaks the layout. Null means the display name itself fits.
    displayNameFallback: text('display_name_fallback'),
    sortName: text('sort_name').notNull(),
    side: text('side', { enum: SIDES }).notNull(),
    language: text('language', { enum: LOCALES }).notNull().default('en'),
    maxPartySize: integer('max_party_size').notNull().default(2),
    phone: text('phone'),
    personalNote: text('personal_note'),
    // Free-text, admin-only. Anything ad hoc the family wants recorded
    // against a household - dietary needs, "calls the landline", anything.
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guests_sort_name_idx').on(t.sortName),
    check('guests_side_valid', inList('side', SIDES)),
    check('guests_language_valid', inList('language', LOCALES)),
    check('guests_max_party_size_positive', sql`${t.maxPartySize} >= 1`),
  ],
);

/* -------------------------------------------------------------------------- */
/* invitations                                                                */
/* -------------------------------------------------------------------------- */

/** Which events a guest is invited to. Absence of a row means not invited. */
export const invitations = pgTable(
  'invitations',
  {
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.guestId, t.eventId] })],
);

/* -------------------------------------------------------------------------- */
/* rsvps                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One row per (guest, event). Upserted, never duplicated, never hard-deleted.
 * "No response" is the ABSENCE of a row - there is no null/maybe state.
 */
export const rsvps = pgTable(
  'rsvps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    attending: boolean('attending').notNull(),
    partyCount: integer('party_count').notNull(),
    attendeeNames: text('attendee_names'),
    source: text('source', { enum: RSVP_SOURCES }).notNull().default('self'),
    recordedBy: text('recorded_by'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('rsvps_guest_event_unique').on(t.guestId, t.eventId),
    check('rsvps_source_valid', inList('source', RSVP_SOURCES)),
    // Declining always means a party of zero; attending always means at least
    // one. Enforced in the domain layer too, but pinned here so no future
    // caller can write an incoherent row.
    check(
      'rsvps_party_count_matches_attending',
      sql`(${t.attending} AND ${t.partyCount} >= 1) OR (NOT ${t.attending} AND ${t.partyCount} = 0)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* rsvp_history                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The previous value of an RSVP, written every time one is overwritten.
 *
 * `rsvps` holds only the current answer, so without this a guest submitting
 * over a response someone transcribed from a phone call would erase it with
 * no trace. When the counts look wrong in November, this is the audit trail:
 * `recorded_by` and `attendee_names` are carried too, because "a phone entry
 * was overwritten" is not much use without knowing who took the call.
 *
 * Append-only. Nothing reads it in the normal flow.
 */
export const rsvpHistory = pgTable(
  'rsvp_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    attending: boolean('attending').notNull(),
    partyCount: integer('party_count').notNull(),
    attendeeNames: text('attendee_names'),
    source: text('source', { enum: RSVP_SOURCES }).notNull(),
    recordedBy: text('recorded_by'),
    /** When this value stopped being the current answer. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rsvp_history_guest_event_idx').on(t.guestId, t.eventId),
    check('rsvp_history_source_valid', inList('source', RSVP_SOURCES)),
  ],
);

/* -------------------------------------------------------------------------- */
/* guest_messages                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A free-text note from the guest. One per guest, upserted alongside the RSVP.
 * `updatedAt` exists because the body is overwritten on re-submission, which
 * would otherwise make `createdAt` a lie.
 */
export const guestMessages = pgTable('guest_messages', {
  guestId: uuid('guest_id')
    .primaryKey()
    .references(() => guests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* delivery_channels                                                          */
/* -------------------------------------------------------------------------- */

/** How this invitation physically reaches the guest. Many per guest. */
export const deliveryChannels = pgTable(
  'delivery_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    channel: text('channel', { enum: DELIVERY_CHANNELS }).notNull(),
    status: text('status', { enum: DELIVERY_STATUSES }).notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentBy: text('sent_by'),
    notes: text('notes'),
  },
  (t) => [
    unique('delivery_channels_guest_channel_unique').on(t.guestId, t.channel),
    check('delivery_channels_channel_valid', inList('channel', DELIVERY_CHANNELS)),
    check('delivery_channels_status_valid', inList('status', DELIVERY_STATUSES)),
  ],
);

/* -------------------------------------------------------------------------- */
/* guest_opens                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The only analytics in the system. Written on SSR of /i/[token], skipping
 * known link-preview crawlers - otherwise WhatsApp's fetch would mark every
 * guest as having opened their invitation the moment it was sent.
 */
export const guestOpens = pgTable('guest_opens', {
  guestId: uuid('guest_id')
    .primaryKey()
    .references(() => guests.id, { onDelete: 'cascade' }),
  firstOpen: timestamp('first_open', { withTimezone: true }),
  lastOpen: timestamp('last_open', { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/* site_config                                                                */
/* -------------------------------------------------------------------------- */

/** One row per logical key. Each key's value has its own Zod schema. */
export const siteConfig = pgTable('site_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

/* -------------------------------------------------------------------------- */
/* inferred row types                                                         */
/* -------------------------------------------------------------------------- */

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type GuestRow = typeof guests.$inferSelect;
export type NewGuestRow = typeof guests.$inferInsert;
export type InvitationRow = typeof invitations.$inferSelect;
export type RsvpRow = typeof rsvps.$inferSelect;
export type NewRsvpRow = typeof rsvps.$inferInsert;
export type RsvpHistoryRow = typeof rsvpHistory.$inferSelect;
export type GuestMessageRow = typeof guestMessages.$inferSelect;
export type DeliveryChannelRow = typeof deliveryChannels.$inferSelect;
export type GuestOpenRow = typeof guestOpens.$inferSelect;
export type SiteConfigRow = typeof siteConfig.$inferSelect;
