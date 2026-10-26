import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import '../src/lib/services/service-test-support.ts';

// Destructive assertions are restricted to an independently generated schema
// in the explicitly named disposable loopback database. Never read .env.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to the disposable local wedding_release_test database.');
const target = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/wedding_release_test');
assert.equal(decodeURIComponent(target.username), 'release_test');
const namespace = `release_clear_${randomUUID().replaceAll('-', '')}`;
assert.match(namespace, /^release_clear_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString, max: 2 });
const pool = new pg.Pool({ connectionString, max: 4,
  options: `-c search_path=${namespace} -c statement_timeout=10000 -c lock_timeout=8000` });
const schema = await import('../src/db/schema.ts');
const { clearAllGuests, guestCount } = await import('../src/lib/services/clear-guests.ts');
const { createGuest, updateGuest } = await import('../src/lib/services/guests.ts');
const { lockGuest } = await import('../src/lib/services/transactions.ts');
const { importGuestsCsv } = await import('../src/lib/services/import.ts');
const db = drizzle(pool, { schema });
let eventId;
const foundations = ['events', 'site_config', 'api_rate_limits'];
const guestOwned = ['invitations', 'rsvps', 'rsvp_history', 'guest_messages', 'guest_opens', 'delivery_channels'];

before(async () => {
  await admin.query(`CREATE SCHEMA "${namespace}"`);
  const directory = path.resolve('src/db/migrations');
  for (const file of fs.readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    await pool.query(fs.readFileSync(path.join(directory, file), 'utf8')
      .replaceAll('REFERENCES "public".', `REFERENCES "${namespace}".`));
  }
  eventId = (await pool.query("INSERT INTO events(slug,name,starts_at,venue_name,venue_address) VALUES('ceremony','Clear test ceremony','2026-12-03T03:45:00Z','Test venue','Test address') RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO site_config(key,value) VALUES('site','{\"keep\":true}'),('phase','{\"keep\":true}'),('messaging','{\"keep\":true}')");
  await pool.query("INSERT INTO api_rate_limits(scope,key_hash,requests,window_ends_at) VALUES('qa-clear',$1,1,'2026-12-03T03:45:00Z')", ['0'.repeat(64)]);
});
beforeEach(async () => { await pool.query('DELETE FROM guests'); });
after(async () => {
  await pool.end();
  try { await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); }
  finally { await admin.end(); }
});
async function rows(tables) {
  const result = {};
  for (const table of tables) result[table] = (await pool.query(`SELECT * FROM "${table}" ORDER BY 1,2`)).rows;
  return result;
}
async function household() {
  const name = `Clear household ${randomUUID()}`;
  const result = await createGuest({ displayName: name, sortName: name, side: 'both', maxPartySize: 4,
    channels: ['whatsapp', 'instagram'], eventSlugs: ['ceremony'] }, db);
  assert.equal(result.ok, true);
  const guest = result.data;
  await pool.query("INSERT INTO rsvps(guest_id,event_id,attending,party_count,source) VALUES($1,$2,true,3,'phone')", [guest.id,eventId]);
  await pool.query("INSERT INTO rsvp_history(guest_id,event_id,attending,party_count,source) VALUES($1,$2,true,2,'self')", [guest.id,eventId]);
  await pool.query("INSERT INTO guest_messages(guest_id,body) VALUES($1,'Keep until clearing')", [guest.id]);
  await pool.query("INSERT INTO guest_opens(guest_id,first_open,last_open) VALUES($1,'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z')", [guest.id]);
  return guest;
}
async function waitForLock(pid) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await delay(15);
  }
  assert.fail('Expected the competing transaction to wait on a database lock');
}

describe('clear all guests in a disposable PostgreSQL schema', () => {
  it('rejects incorrect confirmation and invalid counts before database access', async () => {
    const unavailable = new Proxy({}, { get() { throw new Error('No database operation expected'); } });
    for (const input of [
      { confirmation: 'delete all guests', expectedCount: 1 },
      { confirmation: '', expectedCount: 1 },
      { confirmation: 'DELETE ALL GUESTS', expectedCount: -1 },
      { confirmation: 'DELETE ALL GUESTS', expectedCount: 1.5 },
    ]) {
      const result = await clearAllGuests(input, unavailable);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'validation');
    }
  });

  it('refuses a stale household count without changing guests or dependent records', async () => {
    await household();
    const before = await rows(['guests', ...guestOwned, ...foundations]);
    const result = await clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 0 }, db);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'conflict');
    assert.deepEqual(await rows(['guests', ...guestOwned, ...foundations]), before);
  });

  it('deletes every guest-owned record while preserving event, settings and rate limits', async () => {
    await household(); await household();
    const before = await rows(foundations);
    const result = await clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 2 }, db);
    assert.equal(result.ok, true);
    assert.equal(result.data.deleted, 2);
    for (const table of ['guests', ...guestOwned]) assert.deepEqual((await rows([table]))[table], [], table);
    assert.deepEqual(await rows(foundations), before);
    assert.equal((await clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 0 }, db)).ok, true);
  });

  it('rolls back all cascades and guest deletes when SQL fails during deletion', async () => {
    await household(); await household();
    const before = await rows(['guests', ...guestOwned, ...foundations]);
    await pool.query("CREATE FUNCTION qa_reject_clear() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected clear failure'; END $$");
    await pool.query('CREATE TRIGGER qa_reject_clear AFTER DELETE ON guests FOR EACH ROW EXECUTE FUNCTION qa_reject_clear()');
    try {
      await assert.rejects(clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 2 }, db));
      assert.deepEqual(await rows(['guests', ...guestOwned, ...foundations]), before);
    } finally {
      await pool.query('DROP TRIGGER qa_reject_clear ON guests');
      await pool.query('DROP FUNCTION qa_reject_clear()');
    }
  });

  it('rechecks the count after an in-flight import lock commits rather than clearing stale data', async () => {
    await household();
    const left = await pool.connect(); const right = await pool.connect();
    let pending;
    let committed = false;
    try {
      const rightPid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await left.query('BEGIN');
      await left.query('SELECT pg_advisory_xact_lock(19088743,918273)');
      await left.query("INSERT INTO guests(token,display_name,sort_name,side) VALUES($1,'Concurrent import household','Concurrent import household','both')", [randomUUID()]);
      pending = clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 1 }, drizzle(right, { schema }));
      await waitForLock(rightPid);
      await left.query('COMMIT'); committed = true;
      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'conflict');
      assert.equal(await guestCount(db), 2);
    } finally {
      if (!committed) await left.query('ROLLBACK');
      await Promise.allSettled([pending].filter(Boolean));
      left.release(); right.release();
    }
  });

  it('lets an existing row-locked manual edit finish before clearing without a lock-upgrade deadlock', async () => {
    const guest = await household();
    const left = await pool.connect(); const right = await pool.connect();
    const held = Promise.withResolvers();
    const gate = Promise.withResolvers();
    let changing; let clearing;
    try {
      const rightPid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      changing = drizzle(left, { schema }).transaction(async tx => {
        assert.ok(await lockGuest(tx, { id: guest.id }));
        held.resolve();
        await gate.promise;
        // UPDATE must acquire RowExclusive after SELECT FOR UPDATE's RowShare.
        // A clear holding ShareRowExclusive while waiting on this guest row
        // would prevent this upgrade and create a deadlock cycle.
        return updateGuest(guest.id, { notes: 'Completed manual edit' }, tx);
      });
      void changing.catch(held.reject);
      await held.promise;
      clearing = clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 1 }, drizzle(right, { schema }));
      await waitForLock(rightPid);
      gate.resolve();
      const [changed, cleared] = await Promise.all([changing, clearing]);
      assert.equal(changed.ok && changed.data.notes, 'Completed manual edit');
      assert.equal(cleared.ok && cleared.data.deleted, 1);
      assert.equal(await guestCount(db), 0);
    } finally {
      gate.resolve();
      await Promise.allSettled([changing, clearing].filter(Boolean));
      left.release(); right.release();
    }
  });

  it('waits for the complete multi-batch upload before deleting, preventing later batch repopulation', async () => {
    await pool.query("CREATE FUNCTION qa_pause_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.display_name = 'Clear-lock import 25' THEN PERFORM pg_advisory_xact_lock(19088744,918273); END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER qa_pause_import BEFORE INSERT ON guests FOR EACH ROW EXECUTE FUNCTION qa_pause_import()');
    const gate = await pool.connect(); const left = await pool.connect(); const right = await pool.connect();
    let importing; let clearing;
    try {
      const leftPid = (await left.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const rightPid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await gate.query('SELECT pg_advisory_lock(19088744,918273)');
      const csv = 'display_name,side\n' + Array.from({ length: 50 }, (_,index) => `Clear-lock import ${index},bride`).join('\n');
      importing = importGuestsCsv(csv, { defaultEventSlugs: ['ceremony'] }, drizzle(left, { schema }));
      await waitForLock(leftPid);
      clearing = clearAllGuests({ confirmation: 'DELETE ALL GUESTS', expectedCount: 50 }, drizzle(right, { schema }));
      await waitForLock(rightPid);
      await gate.query('SELECT pg_advisory_unlock(19088744,918273)');
      const [imported, cleared] = await Promise.all([importing, clearing]);
      assert.equal(imported.ok && imported.data.created, 50);
      assert.equal(cleared.ok && cleared.data.deleted, 50);
      assert.equal(await guestCount(db), 0);
    } finally {
      await gate.query('SELECT pg_advisory_unlock(19088744,918273)');
      await Promise.allSettled([importing, clearing].filter(Boolean));
      gate.release(); left.release(); right.release();
      await pool.query('DROP TRIGGER qa_pause_import ON guests');
      await pool.query('DROP FUNCTION qa_pause_import()');
    }
  });
});
