import { writeFileSync } from 'node:fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { toCsv } from '../src/lib/domain/csv.ts';
import { loadEnv } from '../src/db/load-env.ts';

/**
 * Generates the 50-row CSV for the import check, including the cases that
 * actually break importers: a comma inside a quoted note, Sinhala script, an
 * apostrophe, a very long name, and a household with no phone.
 *
 * The `events` column is filled from the slugs actually in the database, not
 * from a literal in this file. It used to say `ceremony|reception`, and when
 * the project dropped to a single event nothing updated it - so every one of
 * the 50 rows failed with "unknown event slug: reception" and the import check
 * this script exists to support could not be run at all.
 *
 * With no database reachable the column is omitted entirely, and the importer
 * falls back to the events chosen in the admin UI. A fixture that imports
 * nothing is worse than a fixture that leans on a default.
 */

loadEnv();

/**
 * Neon suspends an idle branch, and the first connection after that can drop
 * while the compute wakes. One retry covers it. The failure is reported rather
 * than swallowed: silently emitting a degraded fixture because a database
 * blinked is how you end up debugging the wrong thing.
 */
async function readEventSlugs(): Promise<string[]> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL is not set - omitting the events column.');
    return [];
  }

  if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalThis.WebSocket as never;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const result = await pool.query<{ slug: string }>(
        'SELECT slug FROM events ORDER BY sort_order',
      );
      return result.rows.map((row) => row.slug);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      await pool.end();
    }
  }

  console.warn(
    `Could not read events after 3 attempts (${
      lastError instanceof Error ? lastError.message : 'connection failed'
    }). Omitting the events column - choose events in the admin UI instead.`,
  );
  return [];
}

const SIDES = ['bride', 'groom', 'both'] as const;

const slugs = await readEventSlugs();
const withEvents = slugs.length > 0;

const header = [
  'display_name',
  'sort_name',
  'side',
  'max_party_size',
  'phone',
  'notes',
  ...(withEvents ? ['events'] : []),
  'channels',
];

const rows: (string | number)[][] = [header];

for (let i = 1; i <= 50; i += 1) {
  const side = SIDES[i % 3]!;
  const isPrint = i % 5 === 0;

  // Most rows get every event; every seventh gets only the first, so that a
  // partial invitation is exercised the moment a second event exists.
  const events = i % 7 === 0 ? slugs.slice(0, 1) : slugs;

  rows.push([
    i === 7
      ? 'නිමල් සහ සුනේත්‍රා විජේසිංහ'
      : i === 13
        ? "Mr. & Mrs. O'Sullivan-Wickramaratne of Nuwara Eliya and Colombo"
        : `Mr. & Mrs. Test Household ${i}`,
    `Household ${String(i).padStart(2, '0')}`,
    side,
    (i % 4) + 1,
    // Every fifth row also gets a printed card and has no phone number, which
    // is exactly the case that breaks a naive (sort_name, phone) dedupe key.
    isPrint ? '' : `07${String(10000000 + i).slice(0, 8)}`,
    isPrint ? `Card posted to No. ${i}, Temple Road, Kandy 20000` : '',
    ...(withEvents ? [events.join('|')] : []),
    isPrint ? 'print' : 'whatsapp',
  ]);
}

const path = process.argv[2] ?? 'test-import-50.csv';
writeFileSync(path, toCsv(rows), 'utf8');

console.log(`Wrote ${rows.length - 1} data rows to ${path}`);
console.log(
  withEvents
    ? `events column uses the slugs in the database: ${slugs.join(', ')}`
    : 'no database reachable - events column omitted, pick events in the admin UI',
);
console.log('Import it at /admin/guests, then run it a second time: the counts');
console.log('should read "0 created, 50 updated" - that is the idempotency check.');
