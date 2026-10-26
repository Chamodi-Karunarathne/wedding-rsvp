import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import '../src/lib/services/service-test-support.ts';

// Never load .env or use DATABASE_URL. Only this disposable loopback database
// and a generated private schema are eligible for fixture writes and cleanup.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to the disposable local wedding_release_test database.');
const target = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/wedding_release_test');
assert.equal(decodeURIComponent(target.username), 'release_test');
const namespace = `release_channels_${randomUUID().replaceAll('-', '')}`;
assert.match(namespace, /^release_channels_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString, max: 2 });
const pool = new pg.Pool({ connectionString, max: 4,
  options: `-c search_path=${namespace} -c statement_timeout=10000 -c lock_timeout=8000` });
const schema = await import('../src/db/schema.ts');
const { createGuest, updateGuest, setDeliveryChannel, removeDeliveryChannel } = await import('../src/lib/services/guests.ts');
const { buildGuestListCsv } = await import('../src/lib/services/exports.ts');
const { parseCsvWithHeader } = await import('../src/lib/domain/csv.ts');
const { deliveryNeedsPhone } = await import('../src/lib/domain/delivery.ts');
const { guestInputSchema } = await import('../src/lib/domain/guest-input.ts');
const db = drizzle(pool, { schema });
let legacy;
let originalLegacyChannel;

before(async () => {
  await admin.query(`CREATE SCHEMA "${namespace}"`);
  const directory = path.resolve('src/db/migrations');
  const files = fs.readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of files) {
    if (file.startsWith('0005_')) {
      legacy = (await pool.query("INSERT INTO guests(token,display_name,sort_name,side) VALUES($1,'Legacy channel household','Legacy channel household','both') RETURNING *", [randomUUID()])).rows[0];
      originalLegacyChannel = (await pool.query("INSERT INTO delivery_channels(guest_id,channel,status,sent_at,sent_by,notes) VALUES($1,'in_person','delivered','2026-10-01T00:00:00Z','Original sender','Keep delivery metadata') RETURNING *", [legacy.id])).rows[0];
    }
    const sql = fs.readFileSync(path.join(directory, file), 'utf8')
      .replaceAll('REFERENCES "public".', `REFERENCES "${namespace}".`);
    await pool.query(sql);
  }
});

after(async () => {
  await pool.end();
  try { await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); }
  finally { await admin.end(); }
});

async function fixture(extra = {}) {
  const name = `Channel household ${randomUUID()}`;
  const result = await createGuest({ displayName: name, sortName: name, side: 'both', maxPartySize: 4, ...extra }, db);
  assert.equal(result.ok, true, !result.ok ? JSON.stringify(result.error) : '');
  return result.data;
}
const readGuest = async id => (await pool.query('SELECT * FROM guests WHERE id=$1', [id])).rows[0];
const readChannels = async id => (await pool.query('SELECT * FROM delivery_channels WHERE guest_id=$1 ORDER BY channel', [id])).rows;

describe('channel migration and multiple phones in disposable PostgreSQL', () => {
  it('widens the channel constraint without changing legacy delivery metadata', async () => {
    assert.deepEqual((await readChannels(legacy.id))[0], originalLegacyChannel);
    const guest = await fixture({ channels: ['whatsapp', 'print', 'instagram', 'messenger', 'wechat', 'in_person'] });
    assert.deepEqual((await readChannels(guest.id)).map(channel => channel.channel).sort(), [...schema.DELIVERY_CHANNELS].sort());
  });

  it('stores each number independently and keeps WhatsApp missing-phone invites eligible for repair', async () => {
    const guest = await fixture({ phone: '077 123 4567, 0712223333, 94771234567', channels: ['whatsapp', 'instagram'] });
    assert.equal(guest.phone, '+94771234567, +94712223333');
    assert.equal((await readGuest(guest.id)).phone, guest.phone);
    assert.equal(deliveryNeedsPhone({ phone: guest.phone, channels: await readChannels(guest.id) }), false);
    const updated = await updateGuest(guest.id, { phone: null }, db);
    assert.equal(updated.ok && updated.data.phone, null);
    assert.equal(deliveryNeedsPhone({ phone: null, channels: await readChannels(guest.id) }), true);
    assert.equal((await updateGuest(guest.id, { phone: '94 77 000 0001, +44 7700 900123' }, db)).ok, true);
    assert.equal((await readGuest(guest.id)).phone, '+94770000001, +447700900123');
    assert.equal((await updateGuest(guest.id, { notes: 'Phone omitted' }, db)).ok, true);
    assert.equal((await readGuest(guest.id)).phone, '+94770000001, +447700900123');
  });

  it('replaces manual channel assignments atomically while preserving progress for retained channels', async () => {
    const guest = await fixture({ channels: ['whatsapp', 'instagram'] });
    assert.equal(deliveryNeedsPhone({ phone: guest.phone, channels: await readChannels(guest.id) }), true);
    assert.equal((await setDeliveryChannel(guest.id, 'instagram', { status: 'delivered', sentBy: 'Original sender', notes: 'Original channel note' }, db)).ok, true);
    const original = (await readChannels(guest.id)).find(channel => channel.channel === 'instagram');
    assert.equal((await updateGuest(guest.id, { channels: ['instagram', 'wechat'] }, db)).ok, true);
    const updated = await readChannels(guest.id);
    assert.deepEqual(updated.find(channel => channel.channel === 'instagram'), original);
    assert.equal(updated.find(channel => channel.channel === 'wechat').status, 'pending');
    assert.equal(deliveryNeedsPhone({ phone: guest.phone, channels: updated }), false);
    assert.equal((await updateGuest(guest.id, { notes: 'Channels omitted' }, db)).ok, true);
    assert.deepEqual(await readChannels(guest.id), updated);
    assert.equal((await updateGuest(guest.id, { channels: [] }, db)).ok, true);
    assert.deepEqual(await readChannels(guest.id), []);
  });

  it('rolls back guest changes and channel removals if adding a selected channel fails', async () => {
    const guest = await fixture({ phone: '0771234567', channels: ['whatsapp'] });
    const beforeGuest = await readGuest(guest.id);
    const beforeChannels = await readChannels(guest.id);
    await pool.query("ALTER TABLE delivery_channels ADD CONSTRAINT qa_reject_wechat CHECK(channel <> 'wechat') NOT VALID");
    try {
      await assert.rejects(updateGuest(guest.id, { phone: '0712223333', notes: 'Should roll back', channels: ['wechat'] }, db));
      assert.deepEqual(await readGuest(guest.id), beforeGuest);
      assert.deepEqual(await readChannels(guest.id), beforeChannels);
    } finally { await pool.query('ALTER TABLE delivery_channels DROP CONSTRAINT qa_reject_wechat'); }
  });

  it('quotes a multi-number phone cell in the editable CSV export without losing numbers', async () => {
    const guest = await fixture({ phone: '0771234567, 0712223333', channels: ['messenger', 'print'] });
    const csv = await buildGuestListCsv(db);
    assert.ok(csv.includes('"+94771234567, +94712223333"'));
    const row = parseCsvWithHeader(csv).rows.find(row => row.sort_name === guest.sortName);
    assert.equal(row.phone, '+94771234567, +94712223333');
    assert.deepEqual(row.channels.split(';').sort(), ['messenger', 'print']);
  });

  it('validates phone lists while keeping all channel types optional for phone entry', async () => {
    for (const channel of schema.DELIVERY_CHANNELS) {
      assert.equal(guestInputSchema.safeParse({ displayName: 'Guest', sortName: 'Guest', side: 'both', maxPartySize: 2, channels: [channel], phone: null }).success, true);
    }
    for (const phone of ['0771234567, 0712223333', '94771234567, +44 7700 900123']) {
      assert.equal(guestInputSchema.safeParse({ displayName: 'Guest', sortName: 'Guest', side: 'both', maxPartySize: 2, phone }).success, true);
    }
    for (const phone of ['0771234567, N/A', '7.71E+08', '123', '1'.repeat(501)]) {
      const result = await createGuest({ displayName: 'Invalid phone', sortName: 'Invalid phone', side: 'both', phone }, db);
      assert.equal(result.ok, false);
    }
  });

  it('returns not found rather than creating channel records for a removed household', async () => {
    const id = randomUUID();
    for (const result of [await setDeliveryChannel(id, 'messenger', {}, db), await removeDeliveryChannel(id, 'wechat', db)]) {
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'not_found');
    }
  });
});
