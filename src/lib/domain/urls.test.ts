import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  invitationPath,
  invitationUrl,
  qrPath,
  qrUrl,
  shortCodePath,
  shortCodeUrl,
  whatsappSendUrl,
} from './urls.ts';

const ORIGIN = 'https://example.com';

describe('printed URL shapes', () => {
  it('builds the short-code URL the QR encodes', () => {
    assert.equal(shortCodeUrl('K7M3XB', ORIGIN), 'https://example.com/c/K7M3XB');
  });

  it('keeps the printed URL short - it has to scan from a small card', () => {
    // A 6-char code on a typical domain stays well inside QR version 3.
    assert.ok(shortCodeUrl('K7M3XB', ORIGIN).length < 40);
  });

  it('builds the absolute QR image URL for the mail merge', () => {
    assert.equal(qrUrl('K7M3XB', ORIGIN), 'https://example.com/api/qr/K7M3XB.svg');
  });

  it('strips a trailing slash from the origin so URLs never double up', () => {
    assert.equal(shortCodeUrl('K7M3XB', 'https://example.com/'), 'https://example.com/c/K7M3XB');
    assert.equal(shortCodeUrl('K7M3XB', 'https://example.com///'), 'https://example.com/c/K7M3XB');
  });

  it('agrees with the path helpers, so the QR and the redirect cannot drift', () => {
    assert.equal(shortCodeUrl('K7M3XB', ORIGIN), `${ORIGIN}${shortCodePath('K7M3XB')}`);
    assert.equal(qrUrl('K7M3XB', ORIGIN), `${ORIGIN}${qrPath('K7M3XB')}`);
  });
});

describe('invitation URL', () => {
  it('is the canonical destination of the short-code redirect', () => {
    assert.equal(invitationPath('k7mq3xrb9d'), '/i/k7mq3xrb9d');
    assert.equal(invitationUrl('k7mq3xrb9d', ORIGIN), 'https://example.com/i/k7mq3xrb9d');
  });
});

describe('whatsappSendUrl', () => {
  it('strips formatting from the number and encodes the message', () => {
    const url = whatsappSendUrl('+94 77 123 4567', 'Hello there & welcome');
    assert.ok(url.startsWith('https://wa.me/94771234567?text='));
    assert.ok(url.includes('%26')); // & encoded, not treated as a param separator
  });

  it('encodes a URL inside the message without breaking it', () => {
    const url = whatsappSendUrl('+94771234567', `See ${shortCodeUrl('K7M3XB', ORIGIN)}`);
    assert.ok(url.includes(encodeURIComponent('https://example.com/c/K7M3XB')));
  });
});
