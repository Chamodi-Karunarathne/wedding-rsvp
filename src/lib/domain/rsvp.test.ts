import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { messageAction, normalizeRsvp, partyAllowanceFor } from './rsvp.ts';

const intent = (over: Partial<Parameters<typeof normalizeRsvp>[0]> = {}) => ({
  eventSlug: 'reception',
  attending: true,
  partyCount: 2,
  ...over,
});

describe('normalizeRsvp', () => {
  it('accepts a party within the allowance', () => {
    const result = normalizeRsvp(intent({ partyCount: 2 }), 2, 'the reception');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.partyCount, 2);
  });

  it('rejects a party above the allowance with a message naming both numbers', () => {
    const result = normalizeRsvp(intent({ partyCount: 5 }), 2, 'the reception');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'validation');
      assert.equal(result.error.field, 'partyCount');
      assert.match(result.error.message, /up to 2 people/);
      assert.match(result.error.message, /5 were requested/);
    }
  });

  it('says "person" not "people" for an allowance of one', () => {
    const result = normalizeRsvp(intent({ partyCount: 2 }), 1, 'the ceremony');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /up to 1 person/);
  });

  it('rejects a party of zero while attending', () => {
    const result = normalizeRsvp(intent({ partyCount: 0 }), 4, 'the reception');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /at least 1/);
  });

  it('rejects a fractional party count', () => {
    const result = normalizeRsvp(intent({ partyCount: 1.5 }), 4, 'the reception');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /whole number/);
  });

  it('forces a decline to zero and clears names, whatever the client sent', () => {
    const result = normalizeRsvp(
      intent({ attending: false, partyCount: 4, attendeeNames: 'Ranjani, Sunil' }),
      4,
      'the reception',
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.partyCount, 0);
      assert.equal(result.data.attendeeNames, null);
    }
  });

  it('ignores the allowance entirely when declining', () => {
    const result = normalizeRsvp(intent({ attending: false, partyCount: 99 }), 1, 'x');
    assert.equal(result.ok, true);
  });

  it('trims attendee names and nulls blank ones', () => {
    const kept = normalizeRsvp(intent({ attendeeNames: '  Ranjani, Sunil  ' }), 2, 'x');
    assert.equal(kept.ok && kept.data.attendeeNames, 'Ranjani, Sunil');

    const blank = normalizeRsvp(intent({ attendeeNames: '   ' }), 2, 'x');
    assert.equal(blank.ok && blank.data.attendeeNames, null);
  });

  describe('an absent attendeeNames field is not an empty one', () => {
    // The card's two-button RSVP has no names input and sends no field at all.
    // Treating that as "clear it" silently wiped names the guest had entered
    // in the fuller form as soon as they corrected their headcount on the card.
    it('leaves names unchanged when the field is absent', () => {
      const result = normalizeRsvp(intent({}), 2, 'x');
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.attendeeNames, undefined);
    });

    it('clears names when the field is explicitly null', () => {
      const result = normalizeRsvp(intent({ attendeeNames: null }), 2, 'x');
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.attendeeNames, null);
    });

    it('clears names when the field is an empty string', () => {
      const result = normalizeRsvp(intent({ attendeeNames: '' }), 2, 'x');
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.attendeeNames, null);
    });

    it('still clears names on a decline, whatever was sent', () => {
      const result = normalizeRsvp(intent({ attending: false, partyCount: 0 }), 2, 'x');
      assert.equal(result.ok, true);
      // null, not undefined: declining is an explicit clear, not a no-op.
      if (result.ok) assert.equal(result.data.attendeeNames, null);
    });

    it('matches the distinction messageAction already draws', () => {
      const absent = normalizeRsvp(intent({}), 2, 'x');
      const cleared = normalizeRsvp(intent({ attendeeNames: '' }), 2, 'x');
      assert.equal(messageAction(undefined).kind, 'ignore');
      assert.equal(absent.ok && absent.data.attendeeNames === undefined, true);
      assert.equal(messageAction('').kind, 'delete');
      assert.equal(cleared.ok && cleared.data.attendeeNames === null, true);
    });
  });
});

describe('partyAllowanceFor', () => {
  it('reads the guest-level allowance', () => {
    assert.equal(partyAllowanceFor({ maxPartySize: 6 }, { slug: 'reception' }), 6);
  });

  it('is the single place the rule lives, so both events agree today', () => {
    const guest = { maxPartySize: 3 };
    assert.equal(
      partyAllowanceFor(guest, { slug: 'ceremony' }),
      partyAllowanceFor(guest, { slug: 'reception' }),
    );
  });
});

describe('messageAction', () => {
  it('leaves an existing message alone when the field is absent', () => {
    assert.deepEqual(messageAction(undefined), { kind: 'ignore' });
    assert.deepEqual(messageAction(null), { kind: 'ignore' });
  });

  it('deletes when the guest clears the field', () => {
    assert.deepEqual(messageAction(''), { kind: 'delete' });
    assert.deepEqual(messageAction('   '), { kind: 'delete' });
  });

  it('upserts trimmed text', () => {
    assert.deepEqual(messageAction('  Congratulations!  '), {
      kind: 'upsert',
      body: 'Congratulations!',
    });
  });
});
