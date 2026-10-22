import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PUBLIC_RATE_LIMITS, type RateLimitDecision, type RateLimitStore } from '../domain/rate-limit.ts';
import { limitPublicRequest, limitRsvpToken } from './public-limits.ts';

/** Deterministic storage test double. Production uses the atomic PostgreSQL adapter. */
function windowStore(now: () => number): RateLimitStore {
  const counters = new Map<string, { requests: number; end: number }>();
  const consume: RateLimitStore['consume'] = async (policy, identity) => consumeOne(policy, identity);
  const consumeOne = (policy: Parameters<typeof consume>[0], identity: string): RateLimitDecision => {
      const key = `${policy.scope}:${identity}`;
      const time = now();
      const end = (Math.floor(time / policy.windowSeconds) + 1) * policy.windowSeconds;
      const old = counters.get(key);
      const requests = old && old.end > time ? Math.min(old.requests + 1, policy.limit + 1) : 1;
      counters.set(key, { requests, end });
      return { allowed: requests <= policy.limit, retryAfterSeconds: Math.max(1, Math.ceil(end - time)) };
  };
  return {
    consume,
    async consumeAll(entries) {
      const before = new Map(counters);
      let decision = { allowed: true, retryAfterSeconds: 1 };
      for (const { policy, identifier } of entries) {
        decision = consumeOne(policy, identifier);
        if (!decision.allowed) {
          counters.clear();
          for (const [key, value] of before) counters.set(key, value);
          return decision;
        }
      }
      return decision;
    },
  };
}
const request = (address = '192.0.2.1') => new Request('https://wedding.example/api/rsvp', {
  method: 'POST', headers: { 'x-real-ip': address },
});

describe('public endpoint rate-limit guards', () => {
  it('allows exactly the login allowance, denies the next attempt, and resets at the window boundary', async () => {
    let time = 0;
    const store = windowStore(() => time);
    const options = { store, trustedIpHeader: 'x-real-ip' };
    for (let i = 0; i < PUBLIC_RATE_LIMITS.loginIp.limit; i++) {
      assert.equal(await limitPublicRequest(request(), 'login', options), null);
    }
    time = 899.1;
    const denied = await limitPublicRequest(request(), 'login', options);
    assert.equal(denied?.status, 429);
    assert.equal(denied?.headers.get('retry-after'), '1');
    assert.equal(denied?.headers.get('cache-control'), 'no-store');
    time = 900;
    assert.equal(await limitPublicRequest(request(), 'login', options), null);
  });

  it('shares the fallback bucket even when a caller varies untrusted forwarding headers', async () => {
    const store = windowStore(() => 0);
    for (let i = 0; i < PUBLIC_RATE_LIMITS.loginIp.limit; i++) {
      assert.equal(await limitPublicRequest(request(`192.0.2.${i + 1}`), 'login', { store, trustedIpHeader: '' }), null);
    }
    assert.equal((await limitPublicRequest(request('198.51.100.1'), 'login', { store, trustedIpHeader: '' }))?.status, 429);
  });

  it('does not exceed a shared allowance across concurrent callers', async () => {
    const store = windowStore(() => 0);
    const results = await Promise.all(Array.from({ length: 30 }, () => limitPublicRequest(request(), 'login', {
      store, trustedIpHeader: 'x-real-ip',
    })));
    assert.equal(results.filter((response) => response === null).length, PUBLIC_RATE_LIMITS.loginIp.limit);
    assert.equal(results.filter((response) => response?.status === 429).length, 20);
  });

  it('limits a token independently of IP identity, without blocking a different token', async () => {
    const store = windowStore(() => 1);
    for (let i = 0; i < PUBLIC_RATE_LIMITS.rsvpToken.limit; i++) assert.equal(await limitRsvpToken('abc123XYZ0', { store }), null);
    const denied = await limitRsvpToken('abc123XYZ0', { store });
    assert.equal(denied?.status, 429);
    assert.equal(denied?.headers.get('retry-after'), '599');
    assert.equal(await limitRsvpToken('xyz123ABC0', { store }), null);
  });

  it('requests an atomic IP/global batch in that order', async () => {
    const store: RateLimitStore = {
      async consume() { throw new Error('The public gate must use atomic batches.'); },
      async consumeAll(entries) {
        assert.deepEqual(entries.map(({ policy }) => policy), [PUBLIC_RATE_LIMITS.rsvpIp, PUBLIC_RATE_LIMITS.rsvpGlobal]);
        return { allowed: false, retryAfterSeconds: 13 };
      },
    };
    const denied = await limitPublicRequest(request(), 'rsvp', { store });
    assert.equal(denied?.headers.get('retry-after'), '13');
  });

  it('does not let 100 denied attempts from one IP exhaust a different IP’s global budget', async () => {
    for (const parallel of [false, true]) {
      const store = windowStore(() => 1);
      const attempt = () => limitPublicRequest(request(), 'login', { store, trustedIpHeader: 'x-real-ip' });
      if (parallel) {
        const results = await Promise.all(Array.from({ length: 100 }, attempt));
        assert.equal(results.filter((result) => result === null).length, 10);
      } else {
        for (let i = 0; i < 100; i++) await attempt();
      }
      assert.equal(await limitPublicRequest(request('192.0.2.2'), 'login', { store, trustedIpHeader: 'x-real-ip' }), null);
    }
  });

  it('returns a retryable 503 and logs no underlying driver details when storage fails', async () => {
    let logs = 0;
    const unavailable = async () => { throw new Error('database URL and token must not escape'); };
    const store: RateLimitStore = { consume: unavailable, consumeAll: unavailable };
    const response = await limitPublicRequest(request(), 'login', { store, logError: () => { logs++; } });
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get('retry-after'), '30');
    assert.equal(logs, 1);
    assert.ok(!(await response!.text()).includes('database URL'));
  });
});
