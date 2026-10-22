import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hashRateLimitKey, PUBLIC_RATE_LIMITS } from '../domain/rate-limit.ts';
import { createPostgresRateLimitStore, rateLimitQuery, type RateLimitDatabase } from './rate-limits.ts';

const dialect = new PgDialect();
const singleQueryDatabase = (execute: RateLimitDatabase['execute']): RateLimitDatabase => ({
  execute,
  async transaction(command) { return command(execute); },
});

describe('PostgreSQL rate-limit adapter', () => {
  it('uses one atomic, saturating UPSERT and a database-clock fixed-window boundary', () => {
    const { sql, params } = dialect.sqlToQuery(rateLimitQuery(
      PUBLIC_RATE_LIMITS.loginIp, hashRateLimitKey('login-ip', 'ip:192.0.2.10'),
    ));
    assert.match(sql, /ON CONFLICT \("scope", "key_hash"\) DO UPDATE/);
    assert.match(sql, /LEAST\("api_rate_limits"\."requests" \+ 1,/);
    assert.match(sql, /"window_ends_at" <= statement_timestamp\(\) THEN 1/);
    assert.match(sql, /floor\(extract\(epoch FROM statement_timestamp\(\)\)/);
    assert.match(sql, /CEIL\(EXTRACT\(EPOCH FROM/);
    assert.ok(params.includes(PUBLIC_RATE_LIMITS.loginIp.limit + 1));
    assert.ok(params.includes(PUBLIC_RATE_LIMITS.loginIp.windowSeconds));
    assert.ok(!sql.includes('192.0.2.10'));
  });

  it('bounds expiry cleanup and skips counters locked by another request', () => {
    const global = dialect.sqlToQuery(rateLimitQuery(PUBLIC_RATE_LIMITS.rsvpGlobal, hashRateLimitKey('rsvp-global', 'all')));
    assert.match(global.sql, /LIMIT 32 FOR UPDATE SKIP LOCKED/);
    assert.match(global.sql, /interval '1 day'/);
    assert.match(global.sql, /NOT LIKE '%-global'/);
    const token = dialect.sqlToQuery(rateLimitQuery(PUBLIC_RATE_LIMITS.rsvpToken, hashRateLimitKey('rsvp-token', 'abc123XYZ0')));
    assert.ok(!token.sql.includes('DELETE FROM'));
  });

  it('passes only hashed identifiers to the driver and maps allowed/denied results', async () => {
    let allowed = true;
    const store = createPostgresRateLimitStore(singleQueryDatabase(async (query) => {
      const { params } = dialect.sqlToQuery(query);
      assert.ok(params.includes(hashRateLimitKey('rsvp-token', 'abc123XYZ0')));
      assert.ok(!params.includes('abc123XYZ0'));
      return { rows: [{ allowed, retryAfterSeconds: 24 }] };
    }));
    assert.deepEqual(await store.consume(PUBLIC_RATE_LIMITS.rsvpToken, 'abc123XYZ0'), { allowed: true, retryAfterSeconds: 24 });
    allowed = false;
    assert.deepEqual(await store.consume(PUBLIC_RATE_LIMITS.rsvpToken, 'abc123XYZ0'), { allowed: false, retryAfterSeconds: 24 });
  });

  it('fails closed for missing tables, empty results, or malformed retry values', async () => {
    const unavailable = createPostgresRateLimitStore(singleQueryDatabase(async () => { throw new Error('relation does not exist'); }));
    await assert.rejects(unavailable.consume(PUBLIC_RATE_LIMITS.loginIp, 'shared'));
    for (const rows of [[], [{ allowed: true, retryAfterSeconds: 0 }], [{ allowed: true, retryAfterSeconds: 901 }], [{ allowed: 'yes', retryAfterSeconds: 1 }]]) {
      const store = createPostgresRateLimitStore(singleQueryDatabase(async () => ({ rows })));
      await assert.rejects(store.consume(PUBLIC_RATE_LIMITS.loginIp, 'shared'), /Invalid rate-limit database response/);
    }
  });

  it('returns a batch denial only after rollback and never spends later allowances', async () => {
    const trace: string[] = [];
    const store = createPostgresRateLimitStore({
      async execute() { throw new Error('Batches must execute inside a transaction.'); },
      async transaction(command) {
        trace.push('begin');
        try {
          const result = await command(async (query) => {
            trace.push(String(dialect.sqlToQuery(query).params[0]));
            return { rows: [{ allowed: false, retryAfterSeconds: 13 }] };
          });
          trace.push('commit');
          return result;
        } catch (error) {
          trace.push('rollback');
          throw error;
        }
      },
    });
    const result = await store.consumeAll([
      { policy: PUBLIC_RATE_LIMITS.loginIp, identifier: 'limited-ip' },
      { policy: PUBLIC_RATE_LIMITS.loginGlobal, identifier: 'all' },
    ]);
    assert.deepEqual(result, { allowed: false, retryAfterSeconds: 13 });
    assert.deepEqual(trace, ['begin', 'login-ip', 'rollback']);
  });

  it('rolls back the IP allocation when the subsequent global allowance is denied', async () => {
    const trace: string[] = [];
    const store = createPostgresRateLimitStore({
      async execute() { throw new Error('Batches must execute inside a transaction.'); },
      async transaction(command) {
        trace.push('begin');
        try {
          const result = await command(async (query) => {
            const scope = String(dialect.sqlToQuery(query).params[0]);
            trace.push(scope);
            return { rows: [{ allowed: scope !== 'login-global', retryAfterSeconds: 17 }] };
          });
          trace.push('commit');
          return result;
        } catch (error) {
          trace.push('rollback');
          throw error;
        }
      },
    });
    const result = await store.consumeAll([
      { policy: PUBLIC_RATE_LIMITS.loginIp, identifier: 'fresh-ip' },
      { policy: PUBLIC_RATE_LIMITS.loginGlobal, identifier: 'all' },
    ]);
    assert.equal(result.allowed, false);
    assert.deepEqual(trace, ['begin', 'login-ip', 'login-global', 'rollback']);
  });

  it('rejects unsafe policies before constructing SQL', () => {
    for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => rateLimitQuery({ scope: 'test', limit, windowSeconds: 60 }, 'a'.repeat(64)));
    }
    assert.throws(() => rateLimitQuery(PUBLIC_RATE_LIMITS.loginIp, 'raw-ip-address'));
  });
});
