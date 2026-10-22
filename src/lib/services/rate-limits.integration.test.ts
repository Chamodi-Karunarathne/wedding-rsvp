import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hashRateLimitKey } from '../domain/rate-limit.ts';
import { createPostgresRateLimitStore } from './rate-limits.ts';

/**
 * Opt in only against the disposable local release fixture after migrations.
 * Never uses DATABASE_URL. The ordinary test command skips this integration.
 */
const connectionString = process.env.RATE_LIMIT_TEST_DATABASE_URL;

it('enforces durable concurrent windows and bounded cleanup in disposable PostgreSQL', {
  skip: !connectionString,
}, async () => {
  const target = new URL(connectionString!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Integration database must be loopback.');
  assert.equal(target.pathname, '/wedding_release_test', 'Only the disposable release fixture is allowed.');
  assert.equal(decodeURIComponent(target.username), 'release_test', 'Only the disposable release role is allowed.');
  type Queryable = {
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  type Client = Queryable & { release(): void };
  type Pool = {
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    connect(): Promise<Client>;
    end(): Promise<void>;
  };
  const { Pool: PgPool } = createRequire(import.meta.url)('pg') as {
    Pool: new (options: { connectionString: string; max: number; options?: string }) => Pool;
  };
  const schemaName = `rate_limit_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schemaName, /^rate_limit_test_[a-f0-9]{32}$/);
  const admin = new PgPool({ connectionString: connectionString!, max: 1 });
  const pool = new PgPool({
    connectionString: connectionString!, max: 12,
    options: `-c search_path=${schemaName}`,
  });
  const dialect = new PgDialect();
  // Distinct adapter instances share only PostgreSQL, as separate app instances do.
  const execute = (client: Queryable) => async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
    const compiled = dialect.sqlToQuery(query);
    return client.query(compiled.sql, compiled.params);
  };
  const adapter = () => createPostgresRateLimitStore({
    execute: execute(pool),
    async transaction(command) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await command(execute(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  });
  const scopes = [`test-${randomUUID()}`, `test-${randomUUID()}`, `test-${randomUUID()}-global`];
  const [concurrentScope, expiredScope, globalScope] = scopes as [string, string, string];
  try {
    // Every concurrent test connection uses this private table. Public HTTP
    // limiter traffic cannot consume or clean up the deliberately expired rows.
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    await admin.query(`CREATE TABLE "${schemaName}".api_rate_limits (LIKE public.api_rate_limits INCLUDING ALL)`);

    const policy = { scope: concurrentScope, limit: 7, windowSeconds: 3600 };
    const stores = [adapter(), adapter(), adapter()];
    const responses = await Promise.all(Array.from({ length: 36 }, (_, i) =>
      stores[i % stores.length]!.consume(policy, 'private-test-token'),
    ));
    assert.equal(responses.filter((result) => result.allowed).length, 7);
    assert.equal(responses.filter((result) => !result.allowed).length, 29);
    assert.ok(responses.every((result) => result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 3600));
    const stored = await pool.query('SELECT key_hash, requests FROM api_rate_limits WHERE scope = $1', [concurrentScope]);
    assert.equal(stored.rows[0]!.requests, 8, 'Denied traffic must not grow the integer counter.');
    assert.equal(stored.rows[0]!.key_hash, hashRateLimitKey(concurrentScope, 'private-test-token'));

    // End the existing window explicitly; the next attempt must start a fresh
    // DB-clock window, regardless of which app instance handles it.
    await pool.query("UPDATE api_rate_limits SET window_ends_at = statement_timestamp() - interval '1 millisecond' WHERE scope = $1", [concurrentScope]);
    assert.equal((await stores[1]!.consume(policy, 'private-test-token')).allowed, true);
    const reset = await pool.query('SELECT requests, window_ends_at > statement_timestamp() AS future FROM api_rate_limits WHERE scope = $1', [concurrentScope]);
    assert.equal(reset.rows[0]!.requests, 1);
    assert.equal(reset.rows[0]!.future, true);

    // One abusive IP must not spend the shared budget after its own allowance
    // is gone. Exercise both serial traffic and independent concurrent clients.
    for (const parallel of [false, true]) {
      const ipScope = `test-${randomUUID()}`;
      const sharedScope = `test-${randomUUID()}-global`;
      scopes.push(ipScope, sharedScope);
      const ipPolicy = { scope: ipScope, limit: 10, windowSeconds: 3600 };
      const globalPolicy = { scope: sharedScope, limit: 100, windowSeconds: 3600 };
      const attempt = (identity: string, index: number) => stores[index % stores.length]!.consumeAll([
        { policy: ipPolicy, identifier: identity },
        { policy: globalPolicy, identifier: 'all' },
      ]);
      const decisions = [];
      if (parallel) {
        decisions.push(...await Promise.all(Array.from({ length: 100 }, (_, i) => attempt('abusive-ip', i))));
      } else {
        for (let i = 0; i < 100; i++) decisions.push(await attempt('abusive-ip', i));
      }
      assert.equal(decisions.filter((decision) => decision.allowed).length, 10);
      const globalCount = await pool.query('SELECT requests FROM api_rate_limits WHERE scope = $1', [sharedScope]);
      assert.equal(globalCount.rows[0]!.requests, 10, 'IP denials must not spend global capacity.');
      assert.equal((await attempt('different-ip', 0)).allowed, true);
    }

    // Distinct IPs race for the final global slots. Denied transactions must
    // undo their newly inserted IP keys as well as their global increment.
    const boundedIpScope = `test-${randomUUID()}`;
    const boundedGlobalScope = `test-${randomUUID()}-global`;
    scopes.push(boundedIpScope, boundedGlobalScope);
    const boundedIpPolicy = { scope: boundedIpScope, limit: 10, windowSeconds: 3600 };
    const boundedGlobalPolicy = { scope: boundedGlobalScope, limit: 7, windowSeconds: 3600 };
    const sharedDecisions = await Promise.all(Array.from({ length: 40 }, (_, i) =>
      stores[i % stores.length]!.consumeAll([
        { policy: boundedIpPolicy, identifier: `independent-ip-${i}` },
        { policy: boundedGlobalPolicy, identifier: 'all' },
      ]),
    ));
    assert.equal(sharedDecisions.filter((decision) => decision.allowed).length, 7);
    const ipRows = await pool.query('SELECT count(*)::integer AS count FROM api_rate_limits WHERE scope = $1', [boundedIpScope]);
    assert.equal(ipRows.rows[0]!.count, 7, 'Globally rejected requests must not persist new identity rows.');
    const boundedGlobal = await pool.query('SELECT requests FROM api_rate_limits WHERE scope = $1', [boundedGlobalScope]);
    assert.equal(boundedGlobal.rows[0]!.requests, 7);
    assert.equal((await stores[0]!.consumeAll([
      { policy: boundedIpPolicy, identifier: 'fresh-denied-ip' },
      { policy: boundedGlobalPolicy, identifier: 'all' },
    ])).allowed, false);
    const fresh = await pool.query('SELECT count(*)::integer AS count FROM api_rate_limits WHERE scope = $1 AND key_hash = $2', [
      boundedIpScope, hashRateLimitKey(boundedIpScope, 'fresh-denied-ip'),
    ]);
    assert.equal(fresh.rows[0]!.count, 0);

    for (let i = 0; i < 40; i++) {
      await pool.query('INSERT INTO api_rate_limits (scope, key_hash, requests, window_ends_at) VALUES ($1, $2, 1, $3)', [
        expiredScope, hashRateLimitKey(expiredScope, String(i)), new Date(0),
      ]);
    }
    const reservedScopes = ['login-global', 'rsvp-global', 'open-global', 'future-global'];
    for (const scope of reservedScopes) {
      await pool.query('INSERT INTO api_rate_limits (scope, key_hash, requests, window_ends_at) VALUES ($1, $2, 1, $3)', [
        scope, hashRateLimitKey(scope, 'all'), new Date(0),
      ]);
    }
    await stores[0]!.consume({ scope: globalScope, limit: 1, windowSeconds: 60 }, 'all');
    const remaining = await pool.query('SELECT count(*)::integer AS count FROM api_rate_limits WHERE scope = $1', [expiredScope]);
    assert.equal(remaining.rows[0]!.count, 8, 'One global attempt cleans at most 32 expired rows.');
    const reserved = await pool.query('SELECT scope FROM api_rate_limits WHERE scope = ANY($1::text[]) ORDER BY scope', [reservedScopes]);
    assert.deepEqual(reserved.rows.map((row) => row.scope), [...reservedScopes].sort(), 'Cleanup must never lock or delete a global bucket, including new endpoint scopes.');
  } finally {
    await pool.end();
    try {
      // Only the generated, validated namespace can be removed by this suite.
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
});
