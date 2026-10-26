import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './service-test-support.ts';
import type { DbLike } from '@/db/client';
import type { DeliveryChannelName, DeliveryStatus } from './types';

const { listDeliveryChannels, setDeliveryChannel } = await import('./guests.ts');
const { guestInputSchema, deliveryChannelSchema } = await import('../api/schemas.ts');

const guestId = '00000000-0000-4000-8000-000000000001';

describe('retired delivery options', () => {
  it('rejects removed channel/status values before any service write', async () => {
    const forbiddenDb = new Proxy({}, { get() { assert.fail('Rejected delivery options must not access the database.'); } }) as DbLike;
    for (const [channel, status] of [['in_person', 'sent'], ['whatsapp', 'delivered']]) {
      assert.equal(deliveryChannelSchema.safeParse({ guestId, channel, status }).success, false);
      const result = await setDeliveryChannel(guestId, channel as DeliveryChannelName, { status: status as DeliveryStatus }, forbiddenDb);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, 'validation');
    }
    assert.equal(guestInputSchema.safeParse({ displayName: 'Guest', sortName: 'Guest', side: 'both', maxPartySize: 2, channels: ['in_person'] }).success, false);
  });

  it('projects pre-migration records safely without changing delivery metadata or storage', async () => {
    const sentAt = new Date('2026-10-01T00:00:00Z');
    const rows = [
      { id: 'retired', guestId, channel: 'in_person', status: 'delivered', sentAt, sentBy: 'Original sender', notes: 'Original note' },
      { id: 'retained', guestId, channel: 'whatsapp', status: 'delivered', sentAt, sentBy: 'Original sender', notes: 'Original note' },
      { id: 'pending', guestId, channel: 'print', status: 'pending', sentAt: null, sentBy: null, notes: null },
    ];
    const before = structuredClone(rows);
    const readOnlyDb = {
      select() { return { from() { return { where() { return Promise.resolve(rows); } }; } }; },
    } as unknown as DbLike;
    assert.deepEqual(await listDeliveryChannels(guestId, readOnlyDb), [
      { id: 'retained', channel: 'whatsapp', status: 'sent', sentAt, sentBy: 'Original sender', notes: 'Original note' },
      { id: 'pending', channel: 'print', status: 'pending', sentAt: null, sentBy: null, notes: null },
    ]);
    assert.deepEqual(rows, before);
  });
});
