import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.ts';
import { prepareDatabase, resetTestData } from '../src/db/prepare-service.ts';
import { PRODUCTION_CONFIG, PRODUCTION_EVENT } from '../src/db/production-defaults.ts';

// No .env loading and no normal DATABASE_URL fallback, even for test setup.
const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('Set TEST_DATABASE_URL to the disposable local wedding_release_test database.');
const target = new URL(rawUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/wedding_release_test');
assert.equal(decodeURIComponent(target.username), 'release_test');
const schemaName = `prepare_test_${randomUUID().replaceAll('-', '')}`;
assert.match(schemaName, /^prepare_test_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString: rawUrl, max: 1 });
const pool = new pg.Pool({ connectionString: rawUrl, max: 2, options: `-c search_path=${schemaName}` });
const db = drizzle(pool, { schema });
const applicationTables = [
  'events', 'site_config', 'guests', 'invitations', 'rsvps', 'rsvp_history',
  'guest_messages', 'guest_opens', 'delivery_channels', 'api_rate_limits',
];

before(async () => {
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  const directory = path.resolve('src/db/migrations');
  for (const name of fs.readdirSync(directory).filter((file) => /^\d+_.+\.sql$/.test(file)).sort()) {
    await pool.query(fs.readFileSync(path.join(directory, name), 'utf8')
      .replaceAll('REFERENCES "public".', `REFERENCES "${schemaName}".`));
  }
  // A journal-shaped sentinel proves preparation targets application tables
  // explicitly rather than dropping/resetting the schema or using CASCADE.
  await pool.query('CREATE TABLE __drizzle_migrations (id integer PRIMARY KEY, hash text NOT NULL)');
  await pool.query("INSERT INTO __drizzle_migrations VALUES (1, 'migration-ledger-sentinel')");
});

after(async () => {
  try {
    await pool.end();
  } finally {
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
});

async function snapshot() {
  const result = {};
  for (const name of [...applicationTables, '__drizzle_migrations']) {
    result[name] = (await pool.query(`SELECT * FROM "${name}" ORDER BY 1, 2`)).rows;
  }
  return result;
}

async function populateEveryTable() {
  await resetTestData(db, { confirmTestData: true });
  const event = (await pool.query("SELECT id FROM events WHERE slug='ceremony'")).rows[0];
  const guest = (await pool.query("INSERT INTO guests(token,display_name,sort_name,side,max_party_size,notes) VALUES ($1,'Test household','Test household','both',4,'Test notes') RETURNING id", [randomUUID()])).rows[0];
  await pool.query('INSERT INTO invitations(guest_id,event_id) VALUES ($1,$2)', [guest.id, event.id]);
  await pool.query("INSERT INTO rsvps(guest_id,event_id,attending,party_count,source,recorded_by) VALUES ($1,$2,true,2,'phone','Test recorder')", [guest.id, event.id]);
  await pool.query("INSERT INTO rsvp_history(guest_id,event_id,attending,party_count,source) VALUES ($1,$2,true,1,'self')", [guest.id, event.id]);
  await pool.query("INSERT INTO guest_messages(guest_id,body) VALUES ($1,'Test message')", [guest.id]);
  await pool.query('INSERT INTO guest_opens(guest_id,first_open,last_open) VALUES ($1,now(),now())', [guest.id]);
  await pool.query("INSERT INTO delivery_channels(guest_id,channel,status,sent_at,sent_by) VALUES ($1,'whatsapp','sent',now(),'Test sender')", [guest.id]);
  await pool.query("INSERT INTO api_rate_limits(scope,key_hash,requests,window_ends_at) VALUES ('test-scope',repeat('a',64),9,now()+interval '1 hour')");
  return { eventId: event.id, guestId: guest.id };
}

describe('guest-free database preparation in a disposable schema', () => {
  it('prepares a fresh migrated database with the real event and settings and no guests', async () => {
    const prepared = await prepareDatabase(db);
    assert.equal(prepared.eventsCreated, 1);
    assert.deepEqual(prepared.configKeysCreated.sort(), ['messaging', 'phase', 'site']);
    assert.deepEqual(prepared.counts, {
      events: 1, siteConfig: 3, guests: 0, invitations: 0, rsvps: 0,
      rsvpHistory: 0, guestMessages: 0, guestOpens: 0, deliveryChannels: 0, apiRateLimits: 0,
    });
    const event = (await pool.query('SELECT * FROM events')).rows[0];
    assert.equal(event.slug, 'ceremony');
    assert.equal(event.venue_name, PRODUCTION_EVENT.venueName);
    const site = (await pool.query("SELECT value FROM site_config WHERE key='site'")).rows[0].value;
    assert.deepEqual(site, PRODUCTION_CONFIG.site);
    assert.notEqual(site.brideName, 'Bride');
    assert.notEqual(site.groomName, 'Groom');
    assert.ok(site.rsvpContacts.length > 0);
  });

  it('idempotent preparation preserves all existing guest records, configuration and event edits', async () => {
    await populateEveryTable();
    await pool.query("UPDATE events SET name='Configured ceremony',venue_address='Configured address' WHERE slug='ceremony'");
    const configuredSite = { ...PRODUCTION_CONFIG.site, brideName: 'Configured name' };
    await pool.query("UPDATE site_config SET value=$1::jsonb WHERE key='site'", [JSON.stringify(configuredSite)]);
    await pool.query("UPDATE site_config SET value=$1::jsonb WHERE key='messaging'", [JSON.stringify({ whatsappTemplate: 'Configured message' })]);
    const before = await snapshot();
    const prepared = await prepareDatabase(db);
    assert.equal(prepared.eventsCreated, 0);
    assert.deepEqual(prepared.configKeysCreated, []);
    assert.deepEqual(await snapshot(), before);

    await pool.query("DELETE FROM site_config WHERE key='phase'");
    const missingKeyBefore = await snapshot();
    const repaired = await prepareDatabase(db);
    assert.deepEqual(repaired.configKeysCreated, ['phase']);
    const after = await snapshot();
    for (const name of applicationTables.filter((name) => name !== 'site_config')) {
      assert.deepEqual(after[name], missingKeyBefore[name]);
    }
    assert.deepEqual(after.site_config.find((row) => row.key === 'site').value, configuredSite);
    assert.deepEqual(after.site_config.find((row) => row.key === 'messaging').value, { whatsappTemplate: 'Configured message' });
  });

  it('reset removes every application record and restores only canonical foundations while keeping the journal', async () => {
    await populateEveryTable();
    await pool.query("INSERT INTO events(slug,name,starts_at,venue_name,venue_address) VALUES ('extra-test-event','Test event',now(),'Test venue','Test address')");
    await pool.query("INSERT INTO site_config VALUES ('extra-test-key','{}'::jsonb)");
    const reset = await resetTestData(db, { confirmTestData: true });
    assert.equal(reset.eventsCreated, 1);
    assert.deepEqual(reset.counts, {
      events: 1, siteConfig: 3, guests: 0, invitations: 0, rsvps: 0,
      rsvpHistory: 0, guestMessages: 0, guestOpens: 0, deliveryChannels: 0, apiRateLimits: 0,
    });
    assert.deepEqual((await pool.query('SELECT slug FROM events')).rows, [{ slug: 'ceremony' }]);
    assert.deepEqual((await pool.query('SELECT * FROM __drizzle_migrations')).rows, [{ id: 1, hash: 'migration-ledger-sentinel' }]);
    assert.deepEqual((await pool.query("SELECT value FROM site_config WHERE key='site'")).rows[0].value, PRODUCTION_CONFIG.site);
  });

  it('a real SQL failure during foundation insertion rolls back the complete reset', async () => {
    await populateEveryTable();
    await pool.query("ALTER TABLE events ADD CONSTRAINT test_reset_failure CHECK (slug <> 'ceremony') NOT VALID");
    const before = await snapshot();
    try {
      await assert.rejects(resetTestData(db, { confirmTestData: true }));
      assert.deepEqual(await snapshot(), before);
    } finally {
      await pool.query('ALTER TABLE events DROP CONSTRAINT test_reset_failure');
    }
  });

  it('a real SQL failure during safe preparation leaves earlier foundation writes uncommitted', async () => {
    await resetTestData(db, { confirmTestData: true });
    await pool.query('DELETE FROM site_config');
    await pool.query('DELETE FROM events');
    await pool.query("ALTER TABLE site_config ADD CONSTRAINT test_prepare_failure CHECK (key <> 'messaging') NOT VALID");
    const before = await snapshot();
    try {
      await assert.rejects(prepareDatabase(db));
      assert.deepEqual(await snapshot(), before);
    } finally {
      await pool.query('ALTER TABLE site_config DROP CONSTRAINT test_prepare_failure');
    }
  });
});
