import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import '../src/lib/services/service-test-support.ts';

// This suite never loads .env or uses DATABASE_URL. Even an explicit test URL
// must identify the disposable loopback database provisioned for release checks.
const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('Set TEST_DATABASE_URL to the disposable local wedding_release_test database.');
const target = new URL(rawUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Integration tests require a loopback PostgreSQL host.');
assert.equal(target.pathname, '/wedding_release_test', 'Integration tests require the disposable wedding_release_test database.');
assert.equal(decodeURIComponent(target.username), 'release_test', 'Integration tests require the disposable release_test role.');

const schemaName = `release_services_${randomUUID().replaceAll('-', '')}`;
assert.match(schemaName, /^release_services_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString: rawUrl, max: 2 });
const pool = new pg.Pool({
  connectionString: rawUrl, max: 8,
  options: `-c search_path=${schemaName} -c statement_timeout=10000 -c lock_timeout=8000`,
});
const schema = await import('../src/db/schema.ts');
const { createGuest, deleteGuest, setInvitations, updateGuest } = await import('../src/lib/services/guests.ts');
const { importGuestsCsv } = await import('../src/lib/services/import.ts');
const { submitRsvpByGuestId } = await import('../src/lib/services/rsvps.ts');
const { listOpens, recordOpenByToken } = await import('../src/lib/services/opens.ts');
const { lockGuest, withTransaction } = await import('../src/lib/services/transactions.ts');
const { ok, serviceError } = await import('../src/lib/domain/result.ts');
const db = drizzle(pool, { schema });

before(async () => {
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  const directory = path.resolve('src/db/migrations');
  const migrations = fs.readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of migrations) {
    const statement = fs.readFileSync(path.join(directory, name), 'utf8')
      .replaceAll('REFERENCES "public".', `REFERENCES "${schemaName}".`);
    await pool.query(statement);
  }
});

after(async () => {
  await pool.end();
  try {
    // The generated, validated namespace is the only drop target. Public and
    // every other schema/database are never modified by cleanup.
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.end();
  }
});

async function fixture({ allowance = 4 } = {}) {
  const unique = randomUUID().replaceAll('-', '');
  const eventSlug = `ceremony-${unique}`;
  const eventResult = await pool.query(
    `INSERT INTO events (slug, name, starts_at, venue_name, venue_address)
     VALUES ($1, 'Integration ceremony', '2026-12-03T03:45:00Z', 'Test venue', 'Test address') RETURNING id`,
    [eventSlug],
  );
  const name = `Integration ${unique}`;
  const result = await createGuest({
    displayName: name, sortName: name, side: 'bride', maxPartySize: allowance,
    notes: 'Original notes', eventSlugs: [eventSlug],
  }, db);
  assert.equal(result.ok, true);
  return { guest: result.data, eventSlug, eventId: eventResult.rows[0].id };
}

const answer = (eventSlug, partyCount) => ({ responses: [{ eventSlug, attending: true, partyCount }] });
async function current(guestId) {
  const result = await pool.query('SELECT * FROM rsvps WHERE guest_id = $1', [guestId]);
  return result.rows[0];
}
async function history(guestId) {
  const result = await pool.query('SELECT * FROM rsvp_history WHERE guest_id = $1 ORDER BY superseded_at, id', [guestId]);
  return result.rows;
}
async function waitForLock(pid) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await delay(15);
  }
  assert.fail('The competing service transaction never waited on the guest row lock.');
}

/** Hold an actual row lock, prove the other connection waits, then commit A. */
async function race(guestId, first, second) {
  const left = await pool.connect();
  const right = await pool.connect();
  let release;
  let ready;
  const held = new Promise((resolve) => { ready = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let firstPromise;
  let secondPromise;
  try {
    const pid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const firstDb = drizzle(left, { schema });
    const secondDb = drizzle(right, { schema });
    firstPromise = withTransaction(firstDb, async (tx) => {
      assert.ok(await lockGuest(tx, { id: guestId }));
      ready();
      await gate;
      return first(tx);
    });
    let timer;
    try {
      await Promise.race([
        held,
        firstPromise.then(() => { throw new Error('First transaction ended before acquiring its fixture lock.'); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out acquiring the fixture lock.')), 5000); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    secondPromise = second(secondDb);
    await waitForLock(pid);
    release();
    return await Promise.all([firstPromise, secondPromise]);
  } finally {
    release?.();
    await Promise.allSettled([firstPromise, secondPromise].filter(Boolean));
    left.release();
    right.release();
  }
}

describe('PostgreSQL service transactions in a disposable schema', () => {
  it('records visible-link opens by token while ignoring previews, crawlers and deleted links', async () => {
    const f = await fixture();
    const context = { userAgent: 'Mozilla/5.0 Mobile Safari/604.1' };
    await recordOpenByToken(f.guest.token, { ...context, preview: true }, db);
    await recordOpenByToken(f.guest.token, { userAgent: 'WhatsApp/2.24' }, db);
    await recordOpenByToken(`missing-${randomUUID()}`, context, db);
    assert.equal((await listOpens(db)).has(f.guest.id), false);
    await recordOpenByToken(f.guest.token, context, db);
    const first = (await listOpens(db)).get(f.guest.id);
    assert.ok(first?.firstOpen instanceof Date);
    assert.equal(first.firstOpen.toISOString(), first.lastOpen.toISOString());
    await delay(5);
    await recordOpenByToken(f.guest.token, context, db);
    const second = (await listOpens(db)).get(f.guest.id);
    assert.equal(second.firstOpen.toISOString(), first.firstOpen.toISOString());
    assert.ok(second.lastOpen > first.lastOpen);
    assert.equal((await pool.query('SELECT count(*) FROM guest_opens WHERE guest_id=$1', [f.guest.id])).rows[0].count, '1');
    await deleteGuest(f.guest.id, db);
    await recordOpenByToken(f.guest.token, context, db);
    assert.equal((await listOpens(db)).has(f.guest.id), false);
  });

  it('retains the earliest and latest database-clock opens when a delayed request finishes last', async () => {
    const f = await fixture();
    const context = { userAgent: 'Mozilla/5.0 Mobile Safari/604.1' };
    const left = await pool.connect();
    const right = await pool.connect();
    let pending;
    try {
      await left.query('BEGIN');
      const leftDb = drizzle(left, { schema });
      await recordOpenByToken(f.guest.token, context, leftDb);
      const initial = (await left.query('SELECT first_open FROM guest_opens WHERE guest_id=$1', [f.guest.id])).rows[0].first_open;
      const pid = (await right.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending = recordOpenByToken(f.guest.token, context, drizzle(right, { schema }));
      await waitForLock(pid);
      await delay(5);
      // This newer statement commits before the waiting, older statement.
      await recordOpenByToken(f.guest.token, context, leftDb);
      const latest = (await left.query('SELECT last_open FROM guest_opens WHERE guest_id=$1', [f.guest.id])).rows[0].last_open;
      await left.query('COMMIT');
      await pending;
      const actual = (await listOpens(db)).get(f.guest.id);
      assert.equal(actual.firstOpen.toISOString(), initial.toISOString());
      assert.equal(actual.lastOpen.toISOString(), latest.toISOString());
    } finally {
      await left.query('ROLLBACK');
      await Promise.allSettled([pending].filter(Boolean));
      left.release();
      right.release();
    }
  });

  it('repairs nullable historical open timestamps on the next actual visit', async () => {
    const f = await fixture();
    await pool.query('INSERT INTO guest_opens(guest_id,first_open,last_open) VALUES ($1,NULL,NULL)', [f.guest.id]);
    await recordOpenByToken(f.guest.token, { userAgent: 'Mozilla/5.0 Mobile Safari/604.1' }, db);
    const open = (await listOpens(db)).get(f.guest.id);
    assert.ok(open.firstOpen instanceof Date);
    assert.equal(open.firstOpen.toISOString(), open.lastOpen.toISOString());
  });

  it('creates fresh schema from every migration and rejects unknown events without partial guests', async () => {
    const f = await fixture();
    const before = Number((await pool.query('SELECT count(*) FROM guests')).rows[0].count);
    const invalid = await createGuest({ displayName: 'Invalid fixture', sortName: 'Invalid fixture', side: 'groom', eventSlugs: ['missing-event'] }, db);
    assert.equal(invalid.ok, false);
    assert.equal(Number((await pool.query('SELECT count(*) FROM guests')).rows[0].count), before);
    const rejected = await updateGuest(f.guest.id, { displayName: 'Should not persist', eventSlugs: ['missing-event'] }, db);
    assert.equal(rejected.ok, false);
    assert.equal((await pool.query('SELECT display_name FROM guests WHERE id=$1', [f.guest.id])).rows[0].display_name, f.guest.displayName);
    assert.equal((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_schema=$1 AND table_name='guests' AND column_name='personal_note'", [schemaName])).rows[0].count, '0');
  });

  it('rolls back both guest changes and invitation deletion on a real SQL insertion failure', async () => {
    const f = await fixture();
    // NOT VALID retains the existing invitation while rejecting its replacement.
    await pool.query(`ALTER TABLE invitations ADD CONSTRAINT test_replacement_failure CHECK (event_id <> '${f.eventId}'::uuid) NOT VALID`);
    try {
      await assert.rejects(updateGuest(f.guest.id, { displayName: 'Rollback fixture', eventSlugs: [f.eventSlug] }, db));
      assert.equal((await pool.query('SELECT display_name FROM guests WHERE id=$1', [f.guest.id])).rows[0].display_name, f.guest.displayName);
      assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [f.guest.id])).rows[0].count, '1');
      const orphanName = `Rejected create ${randomUUID()}`;
      await assert.rejects(createGuest({ displayName: orphanName, sortName: orphanName, side: 'bride', eventSlugs: [f.eventSlug] }, db));
      assert.equal((await pool.query('SELECT count(*) FROM guests WHERE display_name=$1', [orphanName])).rows[0].count, '0');
    } finally {
      await pool.query('ALTER TABLE invitations DROP CONSTRAINT test_replacement_failure');
    }
  });

  it('recovers a child SQL failure at its savepoint and commits a valid outer command', async () => {
    const f = await fixture();
    await pool.query(`ALTER TABLE invitations ADD CONSTRAINT test_savepoint_failure CHECK (event_id <> '${f.eventId}'::uuid) NOT VALID`);
    try {
      const recovered = await withTransaction(db, async (tx) => {
        let sqlFailure;
        try {
          await updateGuest(f.guest.id, { displayName: 'Failed child edit', eventSlugs: [f.eventSlug] }, tx);
        } catch (error) {
          sqlFailure = error;
        }
        // Drizzle wraps the PostgreSQL error; rollback must still have run
        // before control returns to this caller on the outer transaction.
        assert.equal(sqlFailure?.cause?.code ?? sqlFailure?.code, '23514');
        return updateGuest(f.guest.id, { notes: 'Valid outer edit after SQL failure' }, tx);
      });
      assert.equal(recovered.ok, true);
      const stored = (await pool.query('SELECT display_name, notes FROM guests WHERE id=$1', [f.guest.id])).rows[0];
      assert.equal(stored.display_name, f.guest.displayName);
      assert.equal(stored.notes, 'Valid outer edit after SQL failure');
      assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [f.guest.id])).rows[0].count, '1');
    } finally {
      await pool.query('ALTER TABLE invitations DROP CONSTRAINT test_savepoint_failure');
    }
  });

  it('rolls back a successful child command when its outer command returns an error', async () => {
    const f = await fixture();
    const failed = await withTransaction(db, async (tx) => {
      const child = await updateGuest(f.guest.id, { notes: 'Nested temporary notes' }, tx);
      assert.equal(child.ok, true);
      return serviceError('conflict', 'Intentional outer command rejection');
    });
    assert.equal(failed.ok, false);
    assert.equal((await pool.query('SELECT notes FROM guests WHERE id=$1', [f.guest.id])).rows[0].notes, 'Original notes');
  });

  it('preserves delivery progress on repeated imports and matches preview/save headcount errors', async () => {
    const f = await fixture();
    await pool.query("INSERT INTO delivery_channels (guest_id,channel,status,sent_at,sent_by,notes) VALUES ($1,'whatsapp','delivered','2026-10-01T00:00:00Z','Original sender','Original channel note')", [f.guest.id]);
    const csv = `display_name,side,max_party_size,channels\n${f.guest.displayName},bride,4,whatsapp|print`;
    const reviewed = async (text, dryRun = false) => {
      const check = await importGuestsCsv(text, { dryRun: true }, db);
      assert.equal(check.ok, true);
      const decisions = check.data.results.filter((row) => row.duplicate).map((row) => ({
        row: row.row, guestId: row.duplicate.guestId, updatedAt: row.duplicate.updatedAt, action: 'update',
      }));
      return importGuestsCsv(text, { dryRun, decisions }, db);
    };
    for (let run = 0; run < 2; run += 1) {
      const imported = await reviewed(csv);
      assert.equal(imported.ok && imported.data.updated, 1);
    }
    const channel = (await pool.query("SELECT * FROM delivery_channels WHERE guest_id=$1 AND channel='whatsapp'", [f.guest.id])).rows[0];
    assert.equal(channel.status, 'delivered');
    assert.equal(channel.sent_at.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(channel.sent_by, 'Original sender');
    assert.equal(channel.notes, 'Original channel note');
    assert.equal((await pool.query('SELECT token FROM guests WHERE id=$1', [f.guest.id])).rows[0].token, f.guest.token);
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 4), db)).ok, true);
    const smallCsv = `display_name,side,max_party_size\n${f.guest.displayName},bride,2`;
    const preview = await reviewed(smallCsv, true);
    const save = await reviewed(smallCsv);
    assert.equal(preview.ok && preview.data.errors, 1);
    assert.equal(save.ok && save.data.errors, 1);
    assert.equal(preview.data.results[0].message, save.data.results[0].message);
    assert.equal((await pool.query('SELECT max_party_size FROM guests WHERE id=$1', [f.guest.id])).rows[0].max_party_size, 4);
  });

  it('rolls back a CSV row on a real channel SQL failure and saves the following row', async () => {
    const f = await fixture();
    await pool.query("ALTER TABLE delivery_channels ADD CONSTRAINT test_channel_failure CHECK (channel <> 'print') NOT VALID");
    try {
      const newName = `Next ${randomUUID()}`;
      const csv = `display_name,side,max_party_size,channels\n${f.guest.displayName},bride,4,print\n${newName},groom,2,whatsapp`;
      const preview = await importGuestsCsv(csv, { dryRun: true }, db);
      assert.equal(preview.ok, true);
      const decisions = preview.data.results.filter((row) => row.duplicate).map((row) => ({
        row: row.row, guestId: row.duplicate.guestId, updatedAt: row.duplicate.updatedAt, action: 'update',
      }));
      const imported = await importGuestsCsv(csv, { decisions }, db);
      assert.equal(imported.ok && imported.data.errors, 1);
      assert.equal(imported.ok && imported.data.created, 1);
      assert.equal((await pool.query('SELECT notes FROM guests WHERE id=$1', [f.guest.id])).rows[0].notes, 'Original notes');
      assert.equal((await pool.query('SELECT count(*) FROM guests WHERE display_name=$1', [newName])).rows[0].count, '1');
    } finally {
      await pool.query('ALTER TABLE delivery_channels DROP CONSTRAINT test_channel_failure');
    }
  });

  it('serializes two first replies on separate connections and archives the intermediate answer', async () => {
    const f = await fixture();
    const [first, second] = await race(f.guest.id,
      (tx) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 3), tx),
      (otherDb) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), otherDb));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal((await current(f.guest.id)).party_count, 2);
    assert.deepEqual((await history(f.guest.id)).map((row) => row.party_count), [3]);
    const beforeRetry = await current(f.guest.id);
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), db)).ok, true);
    assert.deepEqual(await current(f.guest.id), beforeRetry);
    assert.equal((await history(f.guest.id)).length, 1);
  });

  it('archives both previous values when concurrent replies replace an existing answer', async () => {
    const f = await fixture();
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 4), db)).ok, true);
    const [first, second] = await race(f.guest.id,
      (tx) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 3), tx),
      (otherDb) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), otherDb));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal((await current(f.guest.id)).party_count, 2);
    assert.deepEqual((await history(f.guest.id)).map((row) => row.party_count), [4, 3]);
  });

  it('revalidates a waiting first RSVP after an allowance reduction commits', async () => {
    const f = await fixture();
    const [edit, response] = await race(f.guest.id,
      (tx) => updateGuest(f.guest.id, { maxPartySize: 2 }, tx),
      (otherDb) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 4), otherDb));
    assert.equal(edit.ok, true);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'validation');
    assert.equal(await current(f.guest.id), undefined);
  });

  it('blocks a waiting allowance reduction after a larger first RSVP commits', async () => {
    const f = await fixture();
    const [response, edit] = await race(f.guest.id,
      (tx) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 4), tx),
      (otherDb) => updateGuest(f.guest.id, { maxPartySize: 2 }, otherDb));
    assert.equal(response.ok, true);
    assert.equal(edit.ok, false);
    assert.equal(edit.error.code, 'conflict');
    assert.equal((await current(f.guest.id)).party_count, 4);
    assert.equal((await pool.query('SELECT max_party_size FROM guests WHERE id=$1', [f.guest.id])).rows[0].max_party_size, 4);
  });

  it('revalidates a waiting first RSVP after its invitation is removed', async () => {
    const f = await fixture();
    const [edit, response] = await race(f.guest.id,
      (tx) => setInvitations(f.guest.id, [], tx),
      (otherDb) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 1), otherDb));
    assert.equal(edit.ok, true);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'forbidden');
    assert.equal(await current(f.guest.id), undefined);
  });

  it('deletes a household and all six guest-owned record types while preserving other households and events', async () => {
    const f = await fixture();
    const other = await fixture();
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), db)).ok, true);
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 3), db)).ok, true);
    await pool.query("INSERT INTO guest_messages(guest_id,body) VALUES ($1,'Deletion fixture message')", [f.guest.id]);
    await pool.query('INSERT INTO guest_opens(guest_id,first_open,last_open) VALUES ($1,now(),now())', [f.guest.id]);
    await pool.query("INSERT INTO delivery_channels(guest_id,channel,status,sent_at,sent_by) VALUES ($1,'whatsapp','delivered',now(),'Deletion fixture')", [f.guest.id]);
    for (const table of ['invitations', 'rsvps', 'rsvp_history', 'guest_messages', 'guest_opens', 'delivery_channels']) {
      assert.equal((await pool.query(`SELECT count(*) FROM "${table}" WHERE guest_id=$1`, [f.guest.id])).rows[0].count, '1');
    }
    const deleted = await deleteGuest(f.guest.id, db);
    assert.equal(deleted.ok, true);
    assert.equal(deleted.data.id, f.guest.id);
    assert.equal((await pool.query('SELECT count(*) FROM guests WHERE id=$1 OR token=$2', [f.guest.id, f.guest.token])).rows[0].count, '0');
    for (const table of ['invitations', 'rsvps', 'rsvp_history', 'guest_messages', 'guest_opens', 'delivery_channels']) {
      assert.equal((await pool.query(`SELECT count(*) FROM "${table}" WHERE guest_id=$1`, [f.guest.id])).rows[0].count, '0');
    }
    assert.equal((await pool.query('SELECT count(*) FROM guests WHERE id=$1', [other.guest.id])).rows[0].count, '1');
    assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [other.guest.id])).rows[0].count, '1');
    assert.equal((await pool.query('SELECT count(*) FROM events WHERE id=$1', [f.eventId])).rows[0].count, '1');
    const repeated = await deleteGuest(f.guest.id, db);
    assert.equal(repeated.ok, false);
    assert.equal(repeated.error.code, 'not_found');
  });

  it('restores a deleted household and its cascaded records if the enclosing command rolls back', async () => {
    const f = await fixture();
    assert.equal((await submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), db)).ok, true);
    await pool.query("INSERT INTO guest_messages(guest_id,body) VALUES ($1,'Keep after rollback')", [f.guest.id]);
    const failed = await withTransaction(db, async (tx) => {
      assert.equal((await deleteGuest(f.guest.id, tx)).ok, true);
      return serviceError('conflict', 'Abort the enclosing deletion command.');
    });
    assert.equal(failed.ok, false);
    assert.equal((await pool.query('SELECT token FROM guests WHERE id=$1', [f.guest.id])).rows[0].token, f.guest.token);
    assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [f.guest.id])).rows[0].count, '1');
    assert.equal((await current(f.guest.id)).party_count, 2);
    assert.equal((await pool.query('SELECT body FROM guest_messages WHERE guest_id=$1', [f.guest.id])).rows[0].body, 'Keep after rollback');
  });

  it('rejects a waiting first reply after the household deletion commits', async () => {
    const f = await fixture();
    const [deleted, response] = await race(f.guest.id,
      (tx) => deleteGuest(f.guest.id, tx),
      (otherDb) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), otherDb));
    assert.equal(deleted.ok, true);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'not_found');
    assert.equal(await current(f.guest.id), undefined);
    assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [f.guest.id])).rows[0].count, '0');
  });

  it('deletes a household and its newly saved reply after waiting for that reply transaction', async () => {
    const f = await fixture();
    const [response, deleted] = await race(f.guest.id,
      (tx) => submitRsvpByGuestId(f.guest.id, answer(f.eventSlug, 2), tx),
      (otherDb) => deleteGuest(f.guest.id, otherDb));
    assert.equal(response.ok, true);
    assert.equal(deleted.ok, true);
    assert.equal(await current(f.guest.id), undefined);
    assert.equal((await pool.query('SELECT count(*) FROM guests WHERE id=$1', [f.guest.id])).rows[0].count, '0');
    assert.equal((await pool.query('SELECT count(*) FROM invitations WHERE guest_id=$1', [f.guest.id])).rows[0].count, '0');
  });
});
