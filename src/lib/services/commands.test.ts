import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { databaseFixture, eventFixture, guestFixture } from './service-test-support.ts';

const { createGuest, updateGuest, setInvitations } = await import('./guests.ts');
const { importGuestsCsv } = await import('./import.ts');
const { submitRsvpByGuestId, submitRsvpByToken } = await import('./rsvps.ts');
const { withTransaction } = await import('./transactions.ts');
const { ok, serviceError } = await import('../domain/result.ts');

describe('guest commands and transaction composition', () => {
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

describe('CSV import commands', () => {
  const csv = 'display_name,sort_name,side,max_party_size,channels\nExisting household,Existing household,bride,4,whatsapp|print';

  it('preserves existing delivery progress and tokens while adding a missing channel', async () => {
    const memory = databaseFixture();
    const sent = {
      id: 'channel-id', guestId: guestFixture.id, channel: 'whatsapp', status: 'delivered',
      sentAt: new Date('2026-10-01T00:00:00Z'), sentBy: 'Original sender', notes: 'Keep note',
    };
    memory.state.delivery_channels!.push(structuredClone(sent));
    const first = await importGuestsCsv(csv, {}, memory.asDb());
    const second = await importGuestsCsv(csv, {}, memory.asDb());
    assert.equal(first.ok && first.data.updated, 1);
    assert.equal(second.ok && second.data.updated, 1);
    assert.deepEqual(memory.state.delivery_channels!.find((row) => row.channel === 'whatsapp'), sent);
    assert.equal(memory.state.delivery_channels!.length, 2);
    assert.equal(memory.state.delivery_channels!.find((row) => row.channel === 'print')!.status, 'pending');
    assert.equal(memory.state.guests![0]!.token, guestFixture.token);
  });

  it('rolls back a failing row and continues to save the next row', async () => {
    const memory = databaseFixture();
    const before = structuredClone(memory.state.guests![0]);
    memory.failInsertInto = 'delivery_channels';
    const result = await importGuestsCsv(csv + '\nAnother household,Another household,groom,2,print', {
      defaultEventSlugs: [eventFixture.slug],
    }, memory.asDb());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.errors, 1);
    assert.equal(result.data.created, 1);
    assert.equal(result.data.results[0]!.status, 'error');
    assert.equal(result.data.results[1]!.status, 'created');
    assert.deepEqual(memory.state.guests![0], before);
    assert.equal(memory.state.guests!.length, 2);
    assert.equal(memory.state.invitations!.length, 2);
    assert.equal(memory.state.delivery_channels!.length, 1);
    assert.equal(memory.state.delivery_channels![0]!.channel, 'print');
  });

  it('reports the same headcount and invitation conflicts in preview and save', async () => {
    const memory = databaseFixture({ responding: true });
    const original = structuredClone(memory.state);
    const tooSmall = 'display_name,side,max_party_size\nExisting household,bride,2';
    const preview = await importGuestsCsv(tooSmall, { dryRun: true }, memory.asDb());
    const saved = await importGuestsCsv(tooSmall, {}, memory.asDb());
    assert.equal(preview.ok, true);
    assert.equal(saved.ok, true);
    if (!preview.ok || !saved.ok) return;
    assert.equal(preview.data.errors, 1);
    assert.equal(saved.data.errors, 1);
    assert.equal(preview.data.results[0]!.message, saved.data.results[0]!.message);
    assert.deepEqual(memory.state, original);

    memory.state.events!.push({ ...eventFixture, id: 'another-event-id', slug: 'other' });
    const removesResponse = 'display_name,side,max_party_size,events\nExisting household,bride,4,other';
    const invitePreview = await importGuestsCsv(removesResponse, { dryRun: true }, memory.asDb());
    const inviteSave = await importGuestsCsv(removesResponse, {}, memory.asDb());
    assert.equal(invitePreview.ok && invitePreview.data.errors, 1);
    assert.equal(inviteSave.ok && inviteSave.data.errors, 1);
    assert.equal(memory.state.invitations![0]!.eventId, eventFixture.id);
  });

  it('rejects more than 1000 rows before any database operation', async () => {
    const memory = databaseFixture();
    const oversized = 'display_name,side\n' + Array.from({ length: 1001 }, (_, i) => `Guest ${i},bride`).join('\n');
    const result = await importGuestsCsv(oversized, {}, memory.asDb());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.field, 'csv');
    assert.deepEqual(memory.trace, []);
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
