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
import { generateShortCode, generateToken } from '../lib/domain/ids.ts';
import {
  DEFAULT_MESSAGING_CONFIG,
  DEFAULT_PHASE_CONFIG,
  DEFAULT_TIMEZONE,
} from '../lib/domain/config.ts';

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

// Asia/Colombo is UTC+05:30. PLACEHOLDER date: Saturday 12 December 2026.
const CEREMONY_AT = new Date('2026-12-12T04:00:00.000Z'); // 09:30 local
const RECEPTION_AT = new Date('2026-12-12T13:00:00.000Z'); // 18:30 local

const EVENT_FIXTURES = [
  {
    slug: 'ceremony',
    name: 'Poruwa Ceremony',
    startsAt: CEREMONY_AT,
    venueName: 'Hotel Elysian, Grand Ballroom',
    venueAddress: '18 Galle Face Terrace, Colombo 03',
    mapUrl: 'https://maps.google.com/?q=Galle+Face+Terrace+Colombo',
    dressCode: 'Traditional / formal',
    sortOrder: 1,
  },
  {
    slug: 'reception',
    name: 'Wedding Reception',
    startsAt: RECEPTION_AT,
    venueName: 'Hotel Elysian, Garden Terrace',
    venueAddress: '18 Galle Face Terrace, Colombo 03',
    mapUrl: 'https://maps.google.com/?q=Galle+Face+Terrace+Colombo',
    dressCode: 'Lounge suit / saree',
    sortOrder: 2,
  },
] as const;

type EventSlug = (typeof EVENT_FIXTURES)[number]['slug'];

type SeedGuest = {
  displayName: string;
  sortName: string;
  side: Side;
  language?: Locale;
  maxPartySize: number;
  phone?: string;
  postalAddress?: string;
  personalNote?: string;
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

const BOTH: EventSlug[] = ['ceremony', 'reception'];

const GUEST_FIXTURES: SeedGuest[] = [
  {
    covers: 'party of 1',
    displayName: 'Ms. Anushka Fernando',
    sortName: 'Fernando, Anushka',
    side: 'groom',
    maxPartySize: 1,
    phone: '077 123 4567',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    covers: 'party of 6',
    displayName: 'Mr. & Mrs. Sunil Jayawardena & Family',
    sortName: 'Jayawardena, Sunil',
    side: 'bride',
    maxPartySize: 6,
    phone: '0712345678',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
  },
  {
    covers: 'invited to only ONE of the two events',
    displayName: 'Dr. Nimal Bandara',
    sortName: 'Bandara, Nimal',
    side: 'groom',
    maxPartySize: 2,
    phone: '0763219876',
    events: ['reception'],
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    covers: 'personal_note',
    displayName: 'Mrs. Kamala Silva',
    sortName: 'Silva, Kamala',
    side: 'bride',
    maxPartySize: 2,
    phone: '0771112223',
    personalNote:
      'Kamala aunty - you taught me to cook, and I still burn the rice. It would not be a wedding without you there.',
    events: BOTH,
    channels: [{ channel: 'in_person', status: 'delivered' }],
  },
  {
    covers: 'has already DECLINED',
    displayName: 'Mr. & Mrs. Ajith Gunasekara',
    sortName: 'Gunasekara, Ajith',
    side: 'groom',
    maxPartySize: 2,
    phone: '0759998887',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'delivered' }],
    rsvps: [
      { slug: 'ceremony', attending: false, partyCount: 0 },
      { slug: 'reception', attending: false, partyCount: 0 },
    ],
    message: 'So sorry we cannot make it - we will be abroad. Wishing you every happiness!',
  },
  {
    covers: 'has already ACCEPTED',
    displayName: 'Mr. & Mrs. Rohan Wijesinghe',
    sortName: 'Wijesinghe, Rohan',
    side: 'bride',
    maxPartySize: 2,
    phone: '0701234567',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'delivered' }],
    rsvps: [
      { slug: 'ceremony', attending: true, partyCount: 2, attendeeNames: 'Rohan, Dilini' },
      { slug: 'reception', attending: true, partyCount: 2, attendeeNames: 'Rohan, Dilini' },
    ],
    message: 'Congratulations! We would not miss it.',
  },
  {
    covers: 'attends reception, skips ceremony - invariant 2, per-event RSVP',
    displayName: 'Mr. Pradeep Abeysekara',
    sortName: 'Abeysekara, Pradeep',
    side: 'groom',
    maxPartySize: 2,
    phone: '0778887776',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
    rsvps: [
      { slug: 'ceremony', attending: false, partyCount: 0 },
      { slug: 'reception', attending: true, partyCount: 2, attendeeNames: 'Pradeep, Shanika' },
    ],
  },
  {
    covers: 'PRINT list: postal address, NO phone',
    displayName: 'Mr. & Mrs. Lakshman Dias',
    sortName: 'Dias, Lakshman',
    side: 'bride',
    maxPartySize: 2,
    postalAddress: '42 Temple Road, Kandy 20000',
    events: BOTH,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    covers: 'BOTH print and whatsapp channels on one guest row',
    displayName: 'Mr. & Mrs. Chandana Rathnayake',
    sortName: 'Rathnayake, Chandana',
    side: 'groom',
    maxPartySize: 4,
    phone: '0714445556',
    postalAddress: '7A Lake Drive, Nugegoda 10250',
    events: BOTH,
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
    postalAddress: 'නො. 15, මාවත, කොළඹ 05',
    events: BOTH,
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
    postalAddress:
      'Walawwa, Bandaranaike Mawatha, Off Kandy Road, Kurunegala 60000, North Western Province',
    events: BOTH,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    covers: 'proxy RSVP recorded over the phone',
    displayName: 'Mrs. Padmini Ekanayake',
    sortName: 'Ekanayake, Padmini',
    side: 'bride',
    maxPartySize: 3,
    phone: '0812223334',
    events: BOTH,
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
      {
        slug: 'reception',
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
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Ms. Hiruni Weerasinghe',
    sortName: 'Weerasinghe, Hiruni',
    side: 'bride',
    maxPartySize: 2,
    phone: '0745556667',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Mr. Kasun Alwis',
    sortName: 'Alwis, Kasun',
    side: 'groom',
    maxPartySize: 1,
    phone: '0767778889',
    events: ['reception'],
    channels: [{ channel: 'whatsapp', status: 'pending' }],
  },
  {
    displayName: 'Mr. & Mrs. Dhanushka Peiris',
    sortName: 'Peiris, Dhanushka',
    side: 'both',
    maxPartySize: 4,
    phone: '0789990001',
    postalAddress: '3 Flower Road, Colombo 07',
    events: BOTH,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    displayName: 'Prof. & Mrs. Gamini Herath',
    sortName: 'Herath, Gamini',
    side: 'both',
    maxPartySize: 2,
    phone: '0112345678',
    events: BOTH,
    channels: [{ channel: 'in_person', status: 'pending' }],
  },
  {
    displayName: 'Ms. Sachini Malalasekera',
    sortName: 'Malalasekera, Sachini',
    side: 'bride',
    maxPartySize: 2,
    phone: '0721113334',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'sent' }],
    rsvps: [{ slug: 'reception', attending: true, partyCount: 1, attendeeNames: 'Sachini' }],
  },
  {
    displayName: 'Mr. & Mrs. Buddhika Karunaratne',
    sortName: 'Karunaratne, Buddhika',
    side: 'groom',
    maxPartySize: 2,
    postalAddress: '88 Beach Road, Negombo 11500',
    events: BOTH,
    channels: [{ channel: 'print', status: 'pending' }],
  },
  {
    displayName: 'Ms. Dilhani Ratnayake',
    sortName: 'Ratnayake, Dilhani',
    side: 'bride',
    maxPartySize: 2,
    phone: '0754446667',
    events: BOTH,
    channels: [{ channel: 'whatsapp', status: 'pending' }],
    rsvps: [{ slug: 'ceremony', attending: false, partyCount: 0 }],
  },
  {
    displayName: 'Mr. Suresh Wickramaratne',
    sortName: 'Wickramaratne, Suresh',
    side: 'groom',
    maxPartySize: 2,
    phone: '0703332221',
    events: BOTH,
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
      { key: 'phase', value: DEFAULT_PHASE_CONFIG },
      {
        key: 'site',
        value: {
          brideName: 'Ranjani',
          groomName: 'Sunil',
          timezone: DEFAULT_TIMEZONE,
        },
      },
      { key: 'messaging', value: DEFAULT_MESSAGING_CONFIG },
    ]);

    console.log('Inserting guests...');
    const usedTokens = new Set<string>();
    const usedCodes = new Set<string>();

    const uniqueToken = (): string => {
      for (;;) {
        const value = generateToken();
        if (!usedTokens.has(value)) return usedTokens.add(value), value;
      }
    };
    const uniqueCode = (): string => {
      for (;;) {
        const value = generateShortCode();
        if (!usedCodes.has(value)) return usedCodes.add(value), value;
      }
    };

    for (const fixture of GUEST_FIXTURES) {
      const [guestRow] = await db
        .insert(guests)
        .values({
          token: uniqueToken(),
          shortCode: uniqueCode(),
          displayName: fixture.displayName,
          sortName: fixture.sortName,
          side: fixture.side,
          language: fixture.language ?? 'en',
          maxPartySize: fixture.maxPartySize,
          phone: fixture.phone ?? null,
          postalAddress: fixture.postalAddress ?? null,
          personalNote: fixture.personalNote ?? null,
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

    console.log(`\nSeeded ${eventRows.length} events and ${allGuests.length} guests.\n`);
    console.log('Sample links:');
    for (const fixture of GUEST_FIXTURES.filter((f) => f.covers).slice(0, 6)) {
      const row = allGuests.find((g) => g.sortName === fixture.sortName);
      if (!row) continue;
      console.log(`  ${fixture.covers}`);
      console.log(`    ${origin}/i/${row.token}   code ${row.shortCode}`);
    }
    console.log(
      `\nUnique tokens: ${new Set(allGuests.map((g) => g.token)).size}/${allGuests.length}`,
    );
    console.log(
      `Unique codes:  ${new Set(allGuests.map((g) => g.shortCode)).size}/${allGuests.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
