import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  invitationPath,
  invitationUrl,
  whatsappSendUrl,
} from './urls.ts';

const ORIGIN = 'https://example.com';

describe('invitation URL', () => {
  it('is the URL that goes into the WhatsApp message', () => {
    assert.equal(invitationUrl('abc123XYZ0', ORIGIN), 'https://example.com/i/abc123XYZ0');
  });

  it('strips a trailing slash from the origin so URLs never double up', () => {
    assert.equal(invitationUrl('abc123XYZ0', 'https://example.com/'), `${ORIGIN}/i/abc123XYZ0`);
    assert.equal(invitationUrl('abc123XYZ0', 'https://example.com///'), `${ORIGIN}/i/abc123XYZ0`);
  });

  it('agrees with the path helper, so the link and the route cannot drift', () => {
    assert.equal(invitationUrl('abc123XYZ0', ORIGIN), `${ORIGIN}${invitationPath('abc123XYZ0')}`);
  });
});

describe('whatsappSendUrl', () => {
  it('strips formatting from the number and encodes the message', () => {
    const url = whatsappSendUrl('+94 77 123 4567', 'Hello & welcome');
    assert.equal(url, 'https://wa.me/94771234567?text=Hello%20%26%20welcome');
  });

  it('encodes a URL inside the message without breaking it', () => {
    const url = whatsappSendUrl('+94771234567', `See ${invitationUrl('abc123XYZ0', ORIGIN)}`);
    assert.ok(url.includes(encodeURIComponent(`${ORIGIN}/i/abc123XYZ0`)));
  });
});
