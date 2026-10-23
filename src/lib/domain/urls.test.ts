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

  it('allows loopback HTTP for local production smoke tests', () => {
    assert.equal(invitationUrl('token', 'http://localhost:3026'), 'http://localhost:3026/i/token');
  });

  it('rejects origins that would generate unsafe or misdirected invitations and metadata', () => {
    for (const origin of ['javascript:alert(1)', '//example.com', 'http://example.com',
      'https://user:password@example.com', 'https://example.com/path',
      'https://example.com?x=1', 'https://example.com/#fragment']) {
      assert.throws(() => invitationUrl('token', origin), /NEXT_PUBLIC_SITE_URL/, origin);
    }
  });
});

describe('whatsappSendUrl', () => {
  it('strips formatting from the number and encodes the message', () => {
    const url = whatsappSendUrl('+94 77 123 4567', 'Hello & welcome');
    assert.equal(url, 'https://api.whatsapp.com/send?phone=94771234567&text=Hello%20%26%20welcome');
  });

  it('encodes a URL inside the message without breaking it', () => {
    const url = whatsappSendUrl('+94771234567', `See ${invitationUrl('abc123XYZ0', ORIGIN)}`);
    assert.ok(url.includes(encodeURIComponent(`${ORIGIN}/i/abc123XYZ0`)));
  });

  it('bypasses the shortener and preserves emoji, Sinhala, line breaks and literal query punctuation', () => {
    const message = '💍 💕 👩‍💻 👨🏽‍👩🏻‍👧🏾‍👦🏿 ආයුබෝවන්\nHello + & ? # 100%\n' +
      invitationUrl('abc123XYZ0', ORIGIN);
    const url = new URL(whatsappSendUrl('+94771234567', message));
    assert.equal(url.origin + url.pathname, 'https://api.whatsapp.com/send');
    assert.equal(url.searchParams.get('text'), message);
    assert.equal(url.searchParams.get('phone'), '94771234567');
    assert.equal(url.searchParams.size, 2);
    assert.equal(url.hash, '');
    assert.ok(!url.href.includes('%EF%BF%BD'));
  });

  it('normalizes previously stored local numbers before opening WhatsApp', () => {
    for (const phone of ['077 123 4567', '771234567', '94771234567', '0094771234567']) {
      assert.equal(new URL(whatsappSendUrl(phone, 'Hello')).searchParams.get('phone'), '94771234567');
    }
  });
});
