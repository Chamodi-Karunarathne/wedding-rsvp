import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deliveryState } from './delivery.ts';

const NEVER: { channels: { status: string }[]; firstOpen: Date | null; hasResponse: boolean } = {
  channels: [],
  firstOpen: null,
  hasResponse: false,
};

const OPENED_AT = new Date('2026-11-01T10:00:00.000Z');

describe('deliveryState', () => {
  it('is not_sent until a channel actually goes out', () => {
    assert.equal(deliveryState(NEVER), 'not_sent');
    assert.equal(
      deliveryState({ ...NEVER, channels: [{ status: 'pending' }] }),
      'not_sent',
      'pending is a plan, not a send',
    );
  });

  it('counts both sent and delivered as sent', () => {
    assert.equal(deliveryState({ ...NEVER, channels: [{ status: 'sent' }] }), 'sent');
    assert.equal(deliveryState({ ...NEVER, channels: [{ status: 'delivered' }] }), 'sent');
  });

  it('takes the furthest channel, not the first', () => {
    assert.equal(
      deliveryState({ ...NEVER, channels: [{ status: 'pending' }, { status: 'delivered' }] }),
      'sent',
    );
  });

  it('moves to opened once someone has loaded the invitation', () => {
    assert.equal(
      deliveryState({ ...NEVER, channels: [{ status: 'sent' }], firstOpen: OPENED_AT }),
      'opened',
    );
  });

  it('reports responded even when nothing was ever marked sent', () => {
    // Someone telephoned their answer before we worked through the send list.
    assert.equal(deliveryState({ ...NEVER, hasResponse: true }), 'responded');
  });

  it('reports responded for a guest who never opened the link', () => {
    // The whole point of the phone flow: an answer that skipped the website.
    assert.equal(
      deliveryState({ channels: [{ status: 'delivered' }], firstOpen: null, hasResponse: true }),
      'responded',
    );
  });

  it('is a high-water mark, so opening after responding stays responded', () => {
    assert.equal(
      deliveryState({
        channels: [{ status: 'delivered' }],
        firstOpen: OPENED_AT,
        hasResponse: true,
      }),
      'responded',
    );
  });
});
