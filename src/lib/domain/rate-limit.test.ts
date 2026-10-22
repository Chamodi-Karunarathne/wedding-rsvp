import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clientRateLimitIdentity, hashRateLimitKey } from './rate-limit.ts';

describe('rate-limit identifiers', () => {
  it('does not trust forwarded IP headers without explicit configuration', () => {
    const headers = new Headers({ 'x-forwarded-for': '192.0.2.1', 'x-real-ip': '192.0.2.2' });
    assert.equal(clientRateLimitIdentity(headers), 'shared');
    assert.equal(clientRateLimitIdentity(headers, 'x-real-ip'), 'ip:192.0.2.2');
  });

  it('falls back to a shared bucket for missing, invalid, or chained addresses', () => {
    for (const address of ['', 'not-an-ip', '192.0.2.1, 192.0.2.2', '192.0.2.1:3000', 'fe80::1%eth0']) {
      assert.equal(clientRateLimitIdentity(new Headers({ 'x-forwarded-for': address }), 'x-forwarded-for'), 'shared');
    }
    assert.equal(clientRateLimitIdentity(new Headers(), 'x-real-ip'), 'shared');
    assert.equal(clientRateLimitIdentity(new Headers(), 'invalid header'), 'shared');
  });

  it('canonicalizes equivalent IPv6 spellings', () => {
    assert.equal(
      clientRateLimitIdentity(new Headers({ 'x-real-ip': '2001:0db8:0:0:0:0:0:1' }), 'x-real-ip'),
      clientRateLimitIdentity(new Headers({ 'x-real-ip': '2001:db8::1' }), 'x-real-ip'),
    );
  });

  it('hashes identifiers deterministically and separates endpoint namespaces', () => {
    const token = 'abc123XYZ0';
    const hash = hashRateLimitKey('rsvp-token', token);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash, hashRateLimitKey('rsvp-token', token));
    assert.notEqual(hash, hashRateLimitKey('login-ip', token));
    assert.notEqual(hash, hashRateLimitKey('rsvp-token', 'otherToken'));
    assert.ok(!hash.includes(token));
  });
});
