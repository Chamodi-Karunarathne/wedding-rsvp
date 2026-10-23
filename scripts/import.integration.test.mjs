import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import '../src/lib/services/service-test-support.ts';

// Never load .env, fall back to DATABASE_URL, or write outside this generated
// private namespace in the explicitly named disposable loopback database.
const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('Set TEST_DATABASE_URL to the disposable local wedding_release_test database.');
const target = new URL(rawUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/wedding_release_test');
assert.equal(decodeURIComponent(target.username), 'release_test');
const schemaName = `release_import_${randomUUID().replaceAll('-', '')}`;
assert.match(schemaName, /^release_import_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString: rawUrl, max: 2 });
const pool = new pg.Pool({
  connectionString: rawUrl, max: 8,
  options: `-c search_path=${schemaName} -c statement_timeout=10000 -c lock_timeout=8000`,
});
const schema = await import('../src/db/schema.ts');
const { createGuest, updateGuest } = await import('../src/lib/services/guests.ts');
const { importGuestsCsv } = await import('../src/lib/services/import.ts');
const { submitRsvpByGuestId } = await import('../src/lib/services/rsvps.ts');
const { buildGuestListCsv } = await import('../src/lib/services/exports.ts');
let queryCount = 0;
const db = drizzle(pool, { schema, logger: { logQuery() { queryCount += 1; } } });
let eventId;
let otherEventId;

before(async () => {
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  const directory = path.resolve('src/db/migrations');
  for (const name of fs.readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    await pool.query(fs.readFileSync(path.join(directory, name), 'utf8').replaceAll('REFERENCES "public".', `REFERENCES "${schemaName}".`));
  }
  const events = await pool.query(`INSERT INTO events(slug,name,starts_at,venue_name,venue_address)
    VALUES ('ceremony','Import ceremony','2026-12-03T03:45:00Z','Test venue','Test address'),
    ('other','Import other','2026-12-03T05:00:00Z','Test venue','Test address') RETURNING id,slug`);
  eventId = events.rows.find((row) => row.slug === 'ceremony').id;
  otherEventId = events.rows.find((row) => row.slug === 'other').id;
});

after(async () => {
  await pool.end();
  try { await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); }
  finally { await admin.end(); }
});

const uniqueName = () => `Import ${randomUUID()}`;
const expectSummary = (result) => {
  assert.equal(result.ok, true, !result.ok ? JSON.stringify(result.error) : '');
  return result.data;
};
const sqlGuest = async (id) => (await pool.query('SELECT * FROM guests WHERE id=$1', [id])).rows[0];
async function fixture(input = {}) {
  const name = uniqueName();
  const result = await createGuest({
    displayName: name, sortName: name, side: 'bride', maxPartySize: 4,
    notes: 'Original notes', displayNameFallback: 'Short form', language: 'si',
    eventSlugs: ['ceremony'], ...input,
  }, db);
  assert.equal(result.ok, true);
  return result.data;
}

describe('CSV import end to end against disposable PostgreSQL', () => {
  it('stores canonical phones when manually creating and editing households', async () => {
    for (const raw of ['077 123 4567', '94771234567', '771234567', '+94 77 123 4567']) {
      const guest = await fixture({ phone: raw });
      assert.equal(guest.phone, '+94771234567');
      assert.equal((await sqlGuest(guest.id)).phone, '+94771234567');
      assert.equal((await updateGuest(guest.id, { phone: '077 765 4321' }, db)).ok, true);
      assert.equal((await sqlGuest(guest.id)).phone, '+94777654321');
      assert.equal((await updateGuest(guest.id, { notes: 'Keep phone' }, db)).ok, true);
      assert.equal((await sqlGuest(guest.id)).phone, '+94777654321');
      assert.equal((await updateGuest(guest.id, { phone: '' }, db)).ok, true);
      assert.equal((await sqlGuest(guest.id)).phone, null);
    }
  });

  it('creates guest, invitation and channels atomically, previews without writes, and reimports normalized phones idempotently', async () => {
    const name = uniqueName();
    const headers = 'display name,sortname,side,language,max party size,phone,events,channels';
    const csv = `${headers}\n${name},${name},bride,si,3,077 123 4567,ceremony,whatsapp|print`;
    const before = (await pool.query('SELECT count(*) FROM guests')).rows[0].count;
    const preview = expectSummary(await importGuestsCsv(csv, { dryRun: true }, db));
    assert.equal(preview.created, 1);
    assert.equal(preview.results[0].token, undefined);
    assert.equal((await pool.query('SELECT count(*) FROM guests')).rows[0].count, before);
    const first = expectSummary(await importGuestsCsv(csv, {}, db));
    assert.equal(first.created, 1);
    const saved = (await pool.query('SELECT * FROM guests WHERE token=$1', [first.results[0].token])).rows[0];
    assert.equal(saved.phone, '+94771234567');
    assert.equal(saved.language, 'si');
    assert.equal((await pool.query('SELECT event_id FROM invitations WHERE guest_id=$1', [saved.id])).rows[0].event_id, eventId);
    assert.equal((await pool.query('SELECT count(*) FROM delivery_channels WHERE guest_id=$1', [saved.id])).rows[0].count, '2');
    const second = expectSummary(await importGuestsCsv(csv.replace('077 123 4567', '+94 77 123 4567'), {}, db));
    assert.equal(second.updated, 1);
    assert.equal(second.created, 0);
    assert.equal(second.results[0].token, saved.token);
    assert.equal((await sqlGuest(saved.id)).created_at.toISOString(), saved.created_at.toISOString());
  });

  it('matches phone-less households and flags repeats inside a file using normalized names and phones', async () => {
    const name = uniqueName();
    const csv = `display_name,side\n${name},groom\n${name.toUpperCase()},groom`;
    const first = expectSummary(await importGuestsCsv(csv, { defaultEventSlugs: ['ceremony'] }, db));
    assert.equal(first.created, 1);
    assert.equal(first.errors, 1);
    assert.match(first.results[1].message, /row 2/);
    const again = expectSummary(await importGuestsCsv(csv, {}, db));
    assert.equal(again.updated, 1);
    assert.equal(again.errors, 1);
  });

  it('refuses ambiguous pre-existing matches instead of overwriting either household', async () => {
    const name = uniqueName();
    const left = await fixture({ displayName: name, sortName: name, phone: '0771234567' });
    const right = await fixture({ displayName: name, sortName: name.toUpperCase(), phone: '+94771234567' });
    const before = [await sqlGuest(left.id), await sqlGuest(right.id)];
    const csv = `display_name,side,phone\n${name},groom,0094771234567`;
    for (const dryRun of [true, false]) {
      const result = expectSummary(await importGuestsCsv(csv, { dryRun }, db));
      assert.equal(result.errors, 1);
      assert.match(result.results[0].message, /Multiple existing guests/);
    }
    assert.deepEqual([await sqlGuest(left.id), await sqlGuest(right.id)], before);
  });

  it('preserves omitted details, invitation tokens, recorded replies, messages, opens and sending progress', async () => {
    const guest = await fixture();
    await pool.query(`INSERT INTO delivery_channels(guest_id,channel,status,sent_at,sent_by,notes)
      VALUES($1,'whatsapp','delivered','2026-10-01T00:00:00Z','Original sender','Channel note')`, [guest.id]);
    assert.equal((await submitRsvpByGuestId(guest.id, { responses: [{ eventSlug: 'ceremony', attending: true, partyCount: 4 }], message: 'Guest message' }, db)).ok, true);
    await pool.query("INSERT INTO guest_opens(guest_id,first_open,last_open) VALUES($1,'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z')", [guest.id]);
    const before = {};
    for (const table of ['rsvps', 'rsvp_history', 'guest_messages', 'guest_opens', 'delivery_channels', 'invitations']) {
      before[table] = (await pool.query(`SELECT * FROM ${table} WHERE guest_id=$1`, [guest.id])).rows;
    }
    const csv = `display_name,side,channels\n${guest.displayName},both,whatsapp|print`;
    for (const dryRun of [true, false, false]) {
      const result = expectSummary(await importGuestsCsv(csv, { dryRun }, db));
      assert.equal(result.updated, 1);
      assert.equal(result.results[0].token, guest.token);
    }
    const saved = await sqlGuest(guest.id);
    assert.equal(saved.notes, 'Original notes');
    assert.equal(saved.display_name_fallback, 'Short form');
    assert.equal(saved.language, 'si');
    assert.equal(saved.max_party_size, 4);
    assert.equal(saved.side, 'both');
    for (const table of ['rsvps', 'rsvp_history', 'guest_messages', 'guest_opens', 'invitations']) {
      assert.deepEqual((await pool.query(`SELECT * FROM ${table} WHERE guest_id=$1`, [guest.id])).rows, before[table]);
    }
    assert.deepEqual((await pool.query("SELECT * FROM delivery_channels WHERE guest_id=$1 AND channel='whatsapp'", [guest.id])).rows, before.delivery_channels);
    assert.equal((await pool.query("SELECT status FROM delivery_channels WHERE guest_id=$1 AND channel='print'", [guest.id])).rows[0].status, 'pending');
  });

  it('allows explicitly blank optional columns to clear/reset documented values', async () => {
    const guest = await fixture();
    const csv = `display_name,side,display_name_fallback,language,max_party_size,notes\n${guest.displayName},bride,,,,`;
    const saved = expectSummary(await importGuestsCsv(csv, {}, db));
    assert.equal(saved.updated, 1);
    const row = await sqlGuest(guest.id);
    assert.equal(row.display_name_fallback, null);
    assert.equal(row.language, 'en');
    assert.equal(row.max_party_size, 2);
    assert.equal(row.notes, null);
    assert.equal((await pool.query('SELECT event_id FROM invitations WHERE guest_id=$1', [guest.id])).rows[0].event_id, eventId);
  });

  it('roundtrips the editable guest export without losing names, notes, tokens, replies or delivery progress', async () => {
    const sortName = uniqueName();
    const guest = await fixture({ displayName: 'සිංහල Family, "Friends"', sortName, phone: '0771234567', notes: 'Line one\nLine two, with comma' });
    assert.equal((await submitRsvpByGuestId(guest.id, { responses: [{ eventSlug: 'ceremony', attending: true, partyCount: 3 }], message: 'Keep message' }, db)).ok, true);
    await pool.query("INSERT INTO delivery_channels(guest_id,channel,status,sent_at,sent_by) VALUES($1,'whatsapp','delivered','2026-10-01T00:00:00Z','Keep sender')", [guest.id]);
    const beforeGuest = await sqlGuest(guest.id);
    const before = {};
    for (const table of ['rsvps', 'rsvp_history', 'guest_messages', 'delivery_channels', 'invitations']) before[table] = (await pool.query(`SELECT * FROM ${table} WHERE guest_id=$1`, [guest.id])).rows;
    const csv = await buildGuestListCsv(db);
    assert.match(csv, /display_name_fallback,sort_name,side,language/);
    assert.equal(csv.includes('whatsapp:delivered'), false);
    const result = expectSummary(await importGuestsCsv(csv, {}, db));
    const saved = result.results.find((row) => row.token === guest.token);
    assert.equal(saved?.status, 'updated');
    const afterGuest = await sqlGuest(guest.id);
    delete beforeGuest.updated_at;
    delete afterGuest.updated_at;
    assert.deepEqual(afterGuest, beforeGuest);
    for (const table of ['rsvps', 'rsvp_history', 'guest_messages', 'delivery_channels', 'invitations']) assert.deepEqual((await pool.query(`SELECT * FROM ${table} WHERE guest_id=$1`, [guest.id])).rows, before[table]);
  });

  it('reports the same allowance and replied-event removal conflicts in preview/save without changing data', async () => {
    const guest = await fixture();
    assert.equal((await submitRsvpByGuestId(guest.id, { responses: [{ eventSlug: 'ceremony', attending: true, partyCount: 4 }] }, db)).ok, true);
    const before = await sqlGuest(guest.id);
    for (const csv of [
      `display_name,side,max_party_size\n${guest.displayName},groom,2`,
      `display_name,side,events\n${guest.displayName},groom,other`,
    ]) {
      const preview = expectSummary(await importGuestsCsv(csv, { dryRun: true }, db));
      const saved = expectSummary(await importGuestsCsv(csv, {}, db));
      assert.equal(preview.errors, 1);
      assert.equal(saved.errors, 1);
      assert.equal(preview.results[0].message, saved.results[0].message);
    }
    assert.deepEqual(await sqlGuest(guest.id), before);
    assert.equal((await pool.query('SELECT event_id FROM invitations WHERE guest_id=$1', [guest.id])).rows[0].event_id, eventId);
  });

  it('rolls back all fields/invitations of a failing row and commits following rows after a real SQL failure', async () => {
    const guest = await fixture();
    const before = await sqlGuest(guest.id);
    const next = uniqueName();
    await pool.query("ALTER TABLE delivery_channels ADD CONSTRAINT import_channel_failure CHECK(channel <> 'print') NOT VALID");
    try {
      const csv = `display_name,side,notes,events,channels\n${guest.displayName},groom,Changed,other,print\n${next},both,New,ceremony,whatsapp`;
      const result = expectSummary(await importGuestsCsv(csv, {}, db));
      assert.equal(result.errors, 1);
      assert.equal(result.created, 1);
      assert.equal(result.results[0].status, 'error');
      assert.equal(result.results[1].status, 'created');
      assert.deepEqual(await sqlGuest(guest.id), before);
      assert.equal((await pool.query('SELECT event_id FROM invitations WHERE guest_id=$1', [guest.id])).rows[0].event_id, eventId);
      const saved = (await pool.query('SELECT id FROM guests WHERE token=$1', [result.results[1].token])).rows[0];
      assert.equal((await pool.query('SELECT channel FROM delivery_channels WHERE guest_id=$1', [saved.id])).rows[0].channel, 'whatsapp');
    } finally { await pool.query('ALTER TABLE delivery_channels DROP CONSTRAINT import_channel_failure'); }
  });

  it('does not leave a guest behind when a new row fails after guest/invitation insert', async () => {
    const name = uniqueName();
    await pool.query("ALTER TABLE delivery_channels ADD CONSTRAINT import_new_failure CHECK(channel <> 'print') NOT VALID");
    try {
      const result = expectSummary(await importGuestsCsv(`display_name,side,events,channels\n${name},bride,ceremony,print`, {}, db));
      assert.equal(result.errors, 1);
      assert.equal((await pool.query('SELECT count(*) FROM guests WHERE display_name=$1', [name])).rows[0].count, '0');
    } finally { await pool.query('ALTER TABLE delivery_channels DROP CONSTRAINT import_new_failure'); }
  });

  it('serializes concurrent overlapping uploads without duplicating households or invitation tokens', async () => {
    const prefix = uniqueName();
    const csv = 'display_name,side\n' + Array.from({ length: 70 }, (_, i) => `${prefix} ${i},bride`).join('\n');
    const results = (await Promise.all([importGuestsCsv(csv, { defaultEventSlugs: ['ceremony'] }, db), importGuestsCsv(csv, { defaultEventSlugs: ['ceremony'] }, db)])).map(expectSummary);
    assert.equal(results.reduce((sum, result) => sum + result.created, 0), 70);
    assert.equal(results.reduce((sum, result) => sum + result.updated, 0), 70);
    assert.equal(results.reduce((sum, result) => sum + result.errors, 0), 0);
    assert.deepEqual(results[0].results.map((row) => row.token), results[1].results.map((row) => row.token));
    assert.equal((await pool.query('SELECT count(*) FROM guests WHERE display_name LIKE $1', [`${prefix}%`])).rows[0].count, '70');
  });

  it('revalidates allowance after waiting for a concurrent response transaction', async () => {
    const guest = await fixture();
    const left = await pool.connect();
    const right = await pool.connect();
    let importing;
    try {
      await left.query('BEGIN');
      await left.query('SELECT id FROM guests WHERE id=$1 FOR UPDATE', [guest.id]);
      await left.query("INSERT INTO rsvps(guest_id,event_id,attending,party_count) VALUES($1,$2,true,4)", [guest.id, eventId]);
      const pid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      importing = importGuestsCsv(`display_name,side,max_party_size\n${guest.displayName},bride,2`, {}, drizzle(right, { schema }));
      const deadline = Date.now() + 4000;
      let blocked = false;
      while (Date.now() < deadline) {
        if ((await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
        await delay(15);
      }
      assert.equal(blocked, true, 'Import must wait on the household lock.');
      await left.query('COMMIT');
      const result = expectSummary(await importing);
      assert.equal(result.errors, 1);
      assert.match(result.results[0].message, /already confirmed/);
      assert.equal((await sqlGuest(guest.id)).max_party_size, 4);
    } finally {
      await left.query('ROLLBACK');
      if (importing) await importing;
      left.release(); right.release();
    }
  });

  it('imports and reimports 1000 households in bounded bulk batches with a small query budget', async () => {
    const prefix = uniqueName();
    const csv = 'display_name,side,events,channels\n' + Array.from({ length: 1000 }, (_, i) => `${prefix} ${i},both,ceremony,whatsapp|print`).join('\n');
    for (const status of ['created', 'updated']) {
      const startQueries = queryCount;
      const start = performance.now();
      const result = expectSummary(await importGuestsCsv(csv, {}, db));
      const elapsed = Math.round(performance.now() - start);
      const queries = queryCount - startQueries;
      assert.equal(result[status], 1000);
      assert.equal(result.errors, 0);
      assert.ok(queries <= 500, `1000 rows should use bulk writes, got ${queries} queries.`);
      console.log(`CSV1000 ${status}: ${elapsed}ms, ${queries} SQL statements (loopback PostgreSQL).`);
    }
  });
});
