import { sql } from 'drizzle-orm';
import type { DbLike, Tx } from './client.ts';
import {
  apiRateLimits,
  deliveryChannels,
  events,
  guestMessages,
  guestOpens,
  guests,
  invitations,
  rsvpHistory,
  rsvps,
  siteConfig,
} from './schema.ts';
import {
  CONFIG_SCHEMAS,
  validatePhaseOrdering,
  type ConfigKey,
} from '../lib/domain/config.ts';
import { PRODUCTION_CONFIG, PRODUCTION_EVENT } from './production-defaults.ts';

export type ApplicationCounts = {
  events: number;
  siteConfig: number;
  guests: number;
  invitations: number;
  rsvps: number;
  rsvpHistory: number;
  guestMessages: number;
  guestOpens: number;
  deliveryChannels: number;
  apiRateLimits: number;
};

export type PreparationSummary = {
  eventsCreated: number;
  configKeysCreated: string[];
  counts: ApplicationCounts;
};

function foundationRows() {
  const ordering = validatePhaseOrdering(PRODUCTION_CONFIG.phase);
  if (!ordering.ok) throw new Error(`Invalid production phase defaults: ${ordering.message}`);
  return (Object.keys(CONFIG_SCHEMAS) as ConfigKey[]).map((key) => ({
    key,
    value: CONFIG_SCHEMAS[key].parse(PRODUCTION_CONFIG[key]),
  }));
}

async function readCounts(tx: Tx): Promise<ApplicationCounts> {
  const result = await tx.execute(sql`
    SELECT
      (SELECT count(*)::integer FROM ${events}) AS "events",
      (SELECT count(*)::integer FROM ${siteConfig}) AS "siteConfig",
      (SELECT count(*)::integer FROM ${guests}) AS "guests",
      (SELECT count(*)::integer FROM ${invitations}) AS "invitations",
      (SELECT count(*)::integer FROM ${rsvps}) AS "rsvps",
      (SELECT count(*)::integer FROM ${rsvpHistory}) AS "rsvpHistory",
      (SELECT count(*)::integer FROM ${guestMessages}) AS "guestMessages",
      (SELECT count(*)::integer FROM ${guestOpens}) AS "guestOpens",
      (SELECT count(*)::integer FROM ${deliveryChannels}) AS "deliveryChannels",
      (SELECT count(*)::integer FROM ${apiRateLimits}) AS "apiRateLimits"
  `);
  const row = result.rows[0] as Partial<ApplicationCounts> | undefined;
  const keys: (keyof ApplicationCounts)[] = [
    'events', 'siteConfig', 'guests', 'invitations', 'rsvps', 'rsvpHistory',
    'guestMessages', 'guestOpens', 'deliveryChannels', 'apiRateLimits',
  ];
  if (!row || keys.some((key) => !Number.isSafeInteger(row[key]) || row[key]! < 0)) {
    throw new Error('Database preparation returned invalid row counts.');
  }
  return row as ApplicationCounts;
}

async function insertMissingFoundations(
  tx: Tx,
  configRows: ReturnType<typeof foundationRows>,
): Promise<PreparationSummary> {
  const insertedEvents = await tx.insert(events).values(PRODUCTION_EVENT)
    .onConflictDoNothing({ target: events.slug }).returning({ id: events.id });
  const insertedConfig = await tx.insert(siteConfig).values(configRows)
    .onConflictDoNothing({ target: siteConfig.key }).returning({ key: siteConfig.key });
  return {
    eventsCreated: insertedEvents.length,
    configKeysCreated: insertedConfig.map((row) => row.key),
    counts: await readCounts(tx),
  };
}

/** Add missing foundations only; existing configuration and guest rows survive. */
export async function prepareDatabase(db: DbLike): Promise<PreparationSummary> {
  const configRows = foundationRows();
  return db.transaction((tx) => insertMissingFoundations(tx, configRows));
}

/**
 * Explicit one-time test-data reset. Clear every current application table in a
 * single transaction, then create real wedding foundations without any guests.
 * No CASCADE is used: an unexpected dependency aborts instead of widening scope.
 * Drizzle's migration ledger is outside this explicit application table list.
 */
export async function resetTestData(
  db: DbLike,
  options: { confirmTestData?: boolean } = {},
): Promise<PreparationSummary> {
  if (options.confirmTestData !== true) {
    throw new Error('Reset requires explicit confirmation that all application data are test data.');
  }
  const configRows = foundationRows();
  return db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE
      ${rsvpHistory}, ${rsvps}, ${guestMessages}, ${guestOpens},
      ${deliveryChannels}, ${invitations}, ${guests}, ${apiRateLimits},
      ${events}, ${siteConfig}
    `);
    const result = await insertMissingFoundations(tx, configRows);
    const { counts } = result;
    if (counts.events !== 1 || counts.siteConfig !== 3 ||
        counts.guests !== 0 || counts.invitations !== 0 || counts.rsvps !== 0 ||
        counts.rsvpHistory !== 0 || counts.guestMessages !== 0 || counts.guestOpens !== 0 ||
        counts.deliveryChannels !== 0 || counts.apiRateLimits !== 0) {
      throw new Error('Reset did not produce the expected empty guest database.');
    }
    return result;
  });
}
