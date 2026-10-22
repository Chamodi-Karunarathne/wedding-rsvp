import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { loadEnv, requireEnv } from './load-env.ts';
import {
  deliveryChannels,
  events,
  guestMessages,
  guestOpens,
  guests,
  invitations,
  rsvps,
  siteConfig,
  type DeliveryChannelName,
  type DeliveryStatus,
  type Locale,
  type Side,
} from './schema.ts';
import { generateToken } from '../lib/domain/ids.ts';
import { PRODUCTION_CONFIG, PRODUCTION_EVENT } from './production-defaults.ts';

/**
 * Development seed. Runs outside Next, so relative imports carry explicit
 * .ts extensions and nothing here uses the @/ alias.
 *
 * DESTRUCTIVE: empties every table before inserting.
 */

loadEnv();

/* -------------------------------------------------------------------------- */
/* fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * ONE event, deliberately seeded through the same tables a dozen would use.
 *
 * The events and invitations tables are not collapsed: if a homecoming or a
 * reception is added later, that must be a row someone inserts, not a
 * migration three weeks before a printed deadline.
 */
const EVENT_FIXTURES = [PRODUCTION_EVENT] as const;

type EventSlug = (typeof EVENT_FIXTURES)[number]['slug'];

type SeedGuest = {
  displayName: string;
  sortName: string;
  side: Side;
  language?: Locale;
  maxPartySize: number;
  phone?: string;
  notes?: string;
  displayNameFallback?: string;
  events: EventSlug[];
  channels?: { channel: DeliveryChannelName; status: DeliveryStatus }[];
  rsvps?: {
    slug: EventSlug;
    attending: boolean;
    partyCount: number;
    attendeeNames?: string;
    source?: 'self' | 'admin' | 'phone';
    recordedBy?: string;
  }[];
  message?: string;
  /** Why this row exists, so nobody "tidies it up" later. */
  covers?: string;
};

const INVITED: EventSlug[] = ['ceremony'];

const GUEST_FIXTURES: SeedGuest[] = [
  {
    covers: 'party of 1',
    displayName: 'Ms. Anushka Fernando',
    sortName: 'Fernando, Anushka',
    side: 'groom',
    maxPartySize: 1,
    phone: '077 123 4567',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    covers: 'party of 6 - the largest household',
    displayName: 'Mr. & Mrs. Sunil Jayawardena & Family',
    sortName: 'Jayawardena, Sunil',
    side: 'bride',
    maxPartySize: 6,
    phone: '0712345678',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
  },
  {
    covers: 'no phone number on file - can only be reached by email',
    displayName: 'Dr. Nimal Bandara',
    sortName: 'Bandara, Nimal',
    side: 'groom',
    maxPartySize: 2,
    phone: '0763219876',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    covers: 'has already DECLINED',
    displayName: 'Mr. & Mrs. Ajith Gunasekara',
    sortName: 'Gunasekara, Ajith',
    side: 'groom',
    maxPartySize: 2,
    phone: '0759998887',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'delivered' }],
    rsvps: [{ slug: 'ceremony', attending: false, partyCount: 0 }],
    message: 'So sorry we cannot make it - we will be abroad. Wishing you every happiness!',
  },
  {
    covers: 'has already ACCEPTED',
    displayName: 'Mr. & Mrs. Rohan Wijesinghe',
    sortName: 'Wijesinghe, Rohan',
    side: 'bride',
    maxPartySize: 2,
    phone: '0701234567',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'delivered' }],
    rsvps: [
      { slug: 'ceremony', attending: true, partyCount: 2, attendeeNames: 'Rohan, Dilini' },
    ],
    message: 'Congratulations! We would not miss it.',
  },
  {
    covers: 'attending with a partial party - 2 of a possible 4',
    displayName: 'Mr. Pradeep Abeysekara',
    sortName: 'Abeysekara, Pradeep',
    side: 'groom',
    maxPartySize: 4,
    phone: '0778887776',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
    rsvps: [
      { slug: 'ceremony', attending: true, partyCount: 2, attendeeNames: 'Pradeep, Shanika' },
    ],
  },
  {
    covers: 'printed card as well as a link, and NO phone number',
    displayName: 'Mr. & Mrs. Lakshman Dias',
    sortName: 'Dias, Lakshman',
    side: 'bride',
    maxPartySize: 2,
    notes: 'Card posted to 42 Temple Road, Kandy. Reachable on the landline only.',
    events: INVITED,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    covers: 'BOTH print and whatsapp channels on one guest row',
    displayName: 'Mr. & Mrs. Chandana Rathnayake',
    sortName: 'Rathnayake, Chandana',
    side: 'groom',
    maxPartySize: 4,
    phone: '0714445556',
    notes: 'Card hand-delivered as well as the link.',
    events: INVITED,
    channels: [
      { channel: 'print', status: 'sent' },
      { channel: 'whatsapp', status: 'delivered' },
    ],
  },
  {
    covers: 'Sinhala script display name - Unicode handling',
    displayName: 'නිමල් සහ කුමාරි පෙරේරා',
    sortName: 'Perera, Nimal',
    side: 'bride',
    language: 'si',
    maxPartySize: 2,
    phone: '0776665554',
    notes: 'Prefers Sinhala. Card posted too.',
    events: INVITED,
    channels: [
      { channel: 'print', status: 'pending' },
      { channel: 'whatsapp', status: 'pending' },
    ],
  },
  {
    covers: 'very long display name - layout stress',
    displayName:
      'Mr. Ariyaratne Mudiyanselage Wickramasinghe Bandaranaike and Mrs. Seetha Kumarihamy Wickramasinghe Bandaranaike of Kurunegala',
    sortName: 'Bandaranaike, Ariyaratne',
    side: 'bride',
    maxPartySize: 2,
    phone: '0372234567',
    displayNameFallback: 'The Bandaranaike Family',
    notes: 'Full name is far too long for the card - fallback set.',
    events: INVITED,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    covers: 'proxy RSVP recorded over the phone',
    displayName: 'Mrs. Padmini Ekanayake',
    sortName: 'Ekanayake, Padmini',
    side: 'bride',
    maxPartySize: 3,
    phone: '0812223334',
    events: INVITED,
    channels: [{ channel: 'in_person', status: 'delivered' }],
    rsvps: [
      {
        slug: 'ceremony',
        attending: true,
        partyCount: 3,
        attendeeNames: 'Padmini, Sarath, Ishara',
        source: 'phone',
        recordedBy: 'amma',
      },
    ],
  },
  /* --- ordinary rows, for volume and filter variety --------------------- */
  {
    displayName: 'Mr. & Mrs. Tharindu Senanayake',
    sortName: 'Senanayake, Tharindu',
    side: 'groom',
    maxPartySize: 2,
    phone: '0723334445',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Ms. Hiruni Weerasinghe',
    sortName: 'Weerasinghe, Hiruni',
    side: 'bride',
    maxPartySize: 2,
    phone: '0745556667',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Mr. Kasun Alwis',
    sortName: 'Alwis, Kasun',
    side: 'groom',
    maxPartySize: 1,
    phone: '0767778889',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Mr. & Mrs. Dhanushka Peiris',
    sortName: 'Peiris, Dhanushka',
    side: 'both',
    maxPartySize: 4,
    phone: '0789990001',
    notes: 'Card posted.',
    events: INVITED,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    displayName: 'Prof. & Mrs. Gamini Herath',
    sortName: 'Herath, Gamini',
    side: 'both',
    maxPartySize: 2,
    phone: '0112345678',
    events: INVITED,
    channels: [{ channel: 'in_person', status: 'pending' }],
  },
  {
    displayName: 'Ms. Sachini Malalasekera',
    sortName: 'Malalasekera, Sachini',
    side: 'bride',
    maxPartySize: 2,
    phone: '0721113334',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
    rsvps: [{ slug: 'ceremony', attending: true, partyCount: 1, attendeeNames: 'Sachini' }],
  },
  {
    displayName: 'Mr. & Mrs. Buddhika Karunaratne',
    sortName: 'Karunaratne, Buddhika',
    side: 'groom',
    maxPartySize: 2,
    notes: 'Card posted. No phone on file.',
    events: INVITED,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    displayName: 'Ms. Dilhani Ratnayake',
    sortName: 'Ratnayake, Dilhani',
    side: 'bride',
    maxPartySize: 2,
    phone: '0754446667',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
    rsvps: [{ slug: 'ceremony', attending: false, partyCount: 0 }],
  },
  {
    displayName: 'Mr. Suresh Wickramaratne',
    sortName: 'Wickramaratne, Suresh',
    side: 'groom',
    maxPartySize: 2,
    phone: '0703332221',
    events: INVITED,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
];

/* -------------------------------------------------------------------------- */
/* runner                                                                     */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed with NODE_ENV=production. Pass --force if you mean it.');
  }

  const url = requireEnv('DATABASE_URL');

  if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalThis.WebSocket as never;
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema: { events, guests } });

  try {
    console.log('Clearing existing data...');
    // Child tables first: event FKs are ON DELETE RESTRICT.
    await db.delete(rsvps);
    await db.delete(guestMessages);
    await db.delete(guestOpens);
    await db.delete(deliveryChannels);
    await db.delete(invitations);
    await db.delete(guests);
    await db.delete(events);
    await db.delete(siteConfig);

    console.log('Inserting events...');
    const eventRows = await db.insert(events).values([...EVENT_FIXTURES]).returning();
    const eventIdBySlug = new Map(eventRows.map((row) => [row.slug, row.id]));

    console.log('Inserting site config...');
    await db.insert(siteConfig).values([
      { key: 'phase', value: PRODUCTION_CONFIG.phase },
      { key: 'site', value: PRODUCTION_CONFIG.site },
      { key: 'messaging', value: PRODUCTION_CONFIG.messaging },
    ]);

    console.log('Inserting guests...');
    const usedTokens = new Set<string>();

    const uniqueToken = (): string => {
      for (;;) {
        const value = generateToken();
        if (!usedTokens.has(value)) return usedTokens.add(value), value;
      }
    };

    for (const fixture of GUEST_FIXTURES) {
      const [guestRow] = await db
        .insert(guests)
        .values({
          token: uniqueToken(),
          displayName: fixture.displayName,
          displayNameFallback: fixture.displayNameFallback ?? null,
          sortName: fixture.sortName,
          side: fixture.side,
          language: fixture.language ?? 'en',
          maxPartySize: fixture.maxPartySize,
          phone: fixture.phone ?? null,
          notes: fixture.notes ?? null,
        })
        .returning();

      if (!guestRow) throw new Error(`Failed to insert ${fixture.displayName}`);

      await db.insert(invitations).values(
        fixture.events.map((slug) => ({
          guestId: guestRow.id,
          eventId: eventIdBySlug.get(slug)!,
        })),
      );

      if (fixture.channels?.length) {
        await db.insert(deliveryChannels).values(
          fixture.channels.map((channel) => ({
            guestId: guestRow.id,
            channel: channel.channel,
            status: channel.status,
            sentAt: channel.status === 'pending' ? null : new Date(),
            sentBy: channel.status === 'pending' ? null : 'seed',
          })),
        );
      }

      if (fixture.rsvps?.length) {
        await db.insert(rsvps).values(
          fixture.rsvps.map((rsvp) => ({
            guestId: guestRow.id,
            eventId: eventIdBySlug.get(rsvp.slug)!,
            attending: rsvp.attending,
            partyCount: rsvp.partyCount,
            attendeeNames: rsvp.attendeeNames ?? null,
            source: rsvp.source ?? 'self',
            recordedBy: rsvp.recordedBy ?? null,
          })),
        );
      }

      if (fixture.message) {
        await db.insert(guestMessages).values({ guestId: guestRow.id, body: fixture.message });
      }
    }

    /* --- report ------------------------------------------------------- */

    const allGuests = await db.select().from(guests);
    const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );

    console.log(`\nSeeded ${eventRows.length} event and ${allGuests.length} guests.\n`);
    console.log('Sample links:');
    for (const fixture of GUEST_FIXTURES.filter((f) => f.covers).slice(0, 6)) {
      const row = allGuests.find((g) => g.sortName === fixture.sortName);
      if (!row) continue;
      console.log(`  ${fixture.covers}`);
      console.log(`    ${origin}/i/${row.token}`);
    }
    console.log(
      `\nUnique tokens: ${new Set(allGuests.map((g) => g.token)).size}/${allGuests.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
