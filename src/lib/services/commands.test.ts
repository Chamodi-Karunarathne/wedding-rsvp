import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { databaseFixture, eventFixture, guestFixture } from './service-test-support.ts';

const { createGuest, updateGuest, setInvitations } = await import('./guests.ts');
const { submitRsvpByGuestId, submitRsvpByToken } = await import('./rsvps.ts');
const { withTransaction } = await import('./transactions.ts');
const { ok, serviceError } = await import('../domain/result.ts');

describe('guest commands and transaction composition', () => {
  it('normalizes manually created and edited guest phones and preserves omitted values', async () => {
    const memory = databaseFixture();
    for (const raw of ['0771234567', '077 123 4567', '94771234567', '771234567', '+94 77 123 4567']) {
      const created = await createGuest({
        displayName: 'Phone guest', sortName: 'Phone guest', side: 'both', phone: raw,
      }, memory.asDb());
      assert.equal(created.ok, true);
      if (!created.ok) continue;
      assert.equal(created.data.phone, '+94771234567');
      assert.equal(memory.state.guests!.find((row) => row.id === created.data.id)!.phone, '+94771234567');
      const edited = await updateGuest(guestFixture.id, { phone: raw }, memory.asDb());
      assert.equal(edited.ok && edited.data.phone, '+94771234567');
      assert.equal(memory.state.guests![0]!.phone, '+94771234567');
    }
    assert.equal((await updateGuest(guestFixture.id, { notes: 'Phone unchanged' }, memory.asDb())).ok, true);
    assert.equal(memory.state.guests![0]!.phone, '+94771234567');
    const foreign = await updateGuest(guestFixture.id, { phone: '44 7700 900123' }, memory.asDb());
    assert.equal(foreign.ok && foreign.data.phone, '+447700900123');
    const cleared = await updateGuest(guestFixture.id, { phone: '' }, memory.asDb());
    assert.equal(cleared.ok && cleared.data.phone, null);
  });

  it('rejects unknown invitations without creating an orphan or changing an existing guest', async () => {
    const memory = databaseFixture();
    const original = structuredClone(memory.state);
    const created = await createGuest({
      displayName: 'New guest', sortName: 'New guest', side: 'groom', eventSlugs: ['unknown'],
    }, memory.asDb());
    const edited = await updateGuest(guestFixture.id, {
      displayName: 'Should not persist', eventSlugs: ['unknown'],
    }, memory.asDb());
    assert.equal(created.ok, false);
    assert.equal(edited.ok, false);
    assert.deepEqual(memory.state, original);
    assert.ok(memory.trace.includes('rollback'));
  });

  it('refuses removing a responded invitation without saving other fields', async () => {
    const memory = databaseFixture({ responding: true });
    const original = structuredClone(memory.state);
    const result = await updateGuest(guestFixture.id, {
      displayName: 'Should not persist', eventSlugs: [],
    }, memory.asDb());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'conflict');
    assert.deepEqual(memory.state, original);
  });

  it('rolls back guest fields and deleted invitations if replacement insertion fails', async () => {
    const memory = databaseFixture();
    const original = structuredClone(memory.state);
    memory.failInsertInto = 'invitations';
    await assert.rejects(updateGuest(guestFixture.id, {
      displayName: 'Should roll back', eventSlugs: [eventFixture.slug],
    }, memory.asDb()), /Injected database failure/);
    assert.deepEqual(memory.state, original);
    assert.ok(memory.trace.includes('delete:invitations'));
  });

  it('rolls back successful nested commands when their enclosing command fails', async () => {
    const memory = databaseFixture();
    const original = structuredClone(memory.state);
    const result = await withTransaction(memory.asDb(), async (tx) => {
      const update = await updateGuest(guestFixture.id, { notes: 'Nested change' }, tx);
      assert.equal(update.ok, true);
      return serviceError('conflict', 'Abort the complete command.');
    });
    assert.equal(result.ok, false);
    assert.deepEqual(memory.state, original);
    assert.ok(memory.trace.includes('savepoint'));
    assert.ok(memory.trace.includes('release'));
    assert.equal(memory.trace.at(-1), 'rollback');
  });

  it('keeps an enclosing transaction usable after a child command returns a validation error', async () => {
    const memory = databaseFixture({ responding: true });
    const result = await withTransaction(memory.asDb(), async (tx) => {
      const rejected = await setInvitations(guestFixture.id, [], tx);
      assert.equal(rejected.ok, false);
      const saved = await updateGuest(guestFixture.id, { notes: 'Valid later command' }, tx);
      return saved.ok ? ok(saved.data) : saved;
    });
    assert.equal(result.ok, true);
    assert.equal(memory.state.guests![0]!.notes, 'Valid later command');
    assert.equal(memory.state.invitations!.length, 1);
    assert.ok(memory.trace.includes('rollback-savepoint'));
  });

  it('blocks lowering assigned places below confirmed attendance and permits a later increase', async () => {
    const memory = databaseFixture({ responding: true });
    const rejected = await updateGuest(guestFixture.id, { maxPartySize: 2 }, memory.asDb());
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.error.code, 'conflict');
      assert.equal(rejected.error.field, 'maxPartySize');
    }
    assert.equal(memory.state.guests![0]!.maxPartySize, 4);
    const raised = await updateGuest(guestFixture.id, { maxPartySize: 6 }, memory.asDb());
    assert.equal(raised.ok, true);
    assert.equal(memory.state.guests![0]!.maxPartySize, 6);
    assert.equal(memory.state.rsvps![0]!.partyCount, 4);
    assert.ok(memory.trace.indexOf('lock:guests') < memory.trace.indexOf('select:rsvps'));
  });
});

describe('RSVP locked writes', () => {
  it('locks the guest before first-response validation and rejects stale allowances', async () => {
    const memory = databaseFixture();
    const lowered = await updateGuest(guestFixture.id, { maxPartySize: 2 }, memory.asDb());
    assert.equal(lowered.ok, true);
    memory.trace.length = 0;
    const rejected = await submitRsvpByToken(guestFixture.token, {
      responses: [{ eventSlug: eventFixture.slug, attending: true, partyCount: 4 }],
    }, memory.asDb());
    assert.equal(rejected.ok, false);
    assert.equal(memory.state.rsvps!.length, 0);
    assert.ok(memory.trace.indexOf('lock:guests') < memory.trace.indexOf('select:invitations'));
  });

  it('archives each actual previous answer and leaves identical retries unchanged', async () => {
    const memory = databaseFixture({ responding: true });
    const initialSubmittedAt = memory.state.rsvps![0]!.submittedAt;
    const input = { responses: [{ eventSlug: eventFixture.slug, attending: true, partyCount: 2 }] };
    const first = await submitRsvpByGuestId(guestFixture.id, input, memory.asDb());
    assert.equal(first.ok, true);
    assert.equal(memory.state.rsvp_history!.length, 1);
    assert.equal(memory.state.rsvp_history![0]!.partyCount, 4);
    assert.equal(memory.state.rsvp_history![0]!.source, 'phone');
    assert.equal(memory.state.rsvps![0]!.attendeeNames, 'Original names');
    assert.deepEqual(memory.state.rsvps![0]!.submittedAt, initialSubmittedAt);
    const afterFirst = structuredClone(memory.state);
    memory.trace.length = 0;
    const retry = await submitRsvpByGuestId(guestFixture.id, input, memory.asDb());
    assert.equal(retry.ok, true);
    assert.deepEqual(memory.state, afterFirst);
    assert.ok(!memory.trace.includes('insert:rsvps'));
    assert.ok(!memory.trace.includes('insert:rsvp_history'));

    await submitRsvpByGuestId(guestFixture.id, {
      responses: [{ eventSlug: eventFixture.slug, attending: false, partyCount: 0 }],
    }, memory.asDb());
    assert.equal(memory.state.rsvp_history!.length, 2);
    assert.equal(memory.state.rsvp_history![1]!.partyCount, 2);
    assert.equal(memory.state.rsvps![0]!.attendeeNames, null);
    assert.equal(memory.state.rsvps![0]!.partyCount, 0);
  });

  it('rolls back history and all answers if a later write fails', async () => {
    const memory = databaseFixture({ responding: true });
    const original = structuredClone(memory.state);
    memory.failInsertInto = 'guest_messages';
    await assert.rejects(submitRsvpByGuestId(guestFixture.id, {
      responses: [{ eventSlug: eventFixture.slug, attending: true, partyCount: 2 }],
      message: 'This failure must also roll back the reply and history.',
    }, memory.asDb()), /Injected database failure/);
    assert.deepEqual(memory.state, original);
    assert.ok(memory.trace.includes('insert:rsvp_history'));
    assert.ok(memory.trace.includes('insert:rsvps'));
  });
});
