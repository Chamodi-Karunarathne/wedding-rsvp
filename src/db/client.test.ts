import assert from 'node:assert/strict';
import { after, describe, it, type TestContext } from 'node:test';
import { Client, Pool, neonConfig } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './client.ts';
import { guests } from './schema.ts';

// Exercise the installed driver and Drizzle adapter against transport stubs.
// This fake URL is never contacted, and the normal DATABASE_URL is never used
// for a connection.
const testUrl = 'postgresql://transport_test:never-connect@ep-test-pooler.example.neon.tech/transport_test?sslmode=require';
const originalUrl = process.env.DATABASE_URL;
const originalFetch = neonConfig.fetchFunction;
process.env.DATABASE_URL = testUrl;
const db = getDb();
if (originalUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = originalUrl;
const cachedPool = (globalThis as { __weddingDb?: { pool?: Pool } }).__weddingDb?.pool;
assert.ok(cachedPool instanceof Pool);
const pool = cachedPool;

after(async () => {
  neonConfig.fetchFunction = originalFetch;
  await pool.end();
});

type SentQuery = { query: string; params: unknown[] };

/** Stub only a checked-out WebSocket client's wire IO, leaving Drizzle intact. */
function checkedOutClient(t: TestContext) {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Transactions must not issue HTTP queries.'); });
  let releases = 0;
  const client = Object.assign(new Client({ connectionString: testUrl }), {
    release() { releases += 1; },
  });
  const commands: { text: string; values: unknown[] }[] = [];
  t.mock.method(client, 'query', (async (config: string | { text: string }, values?: unknown[]) => {
    commands.push({ text: (typeof config === 'string' ? config : config.text).trim(), values: values ?? [] });
    return { rows: [], fields: [], rowCount: 0, command: 'SELECT' };
  }) as typeof client.query);
  const acquire = t.mock.method(pool, 'connect', (() => Promise.resolve(client)) as typeof pool.connect);
  return { client, commands, acquire, releases: () => releases };
}

describe('Neon HTTP reads and WebSocket transactions', () => {
  it('runs independent Drizzle reads concurrently over HTTP and maps dates with bound parameters', { timeout: 3000 }, async (t) => {
    const acquire = t.mock.method(pool, 'connect', (() => {
      throw new Error('Standalone reads must not acquire a WebSocket client.');
    }) as typeof pool.connect);
    const requests: SentQuery[] = [];
    let release: () => void = () => { throw new Error('Barrier not initialized.'); };
    const allStarted = new Promise<void>((resolve) => { release = resolve; });
    t.mock.method(globalThis, 'fetch', async (_input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      const sent = JSON.parse(String(options?.body)) as SentQuery;
      requests.push(sent);
      assert.equal(options?.cache, 'no-store', 'Database requests must bypass the Next fetch cache.');
      assert.equal(new Headers(options?.headers).get('Neon-Array-Mode'), 'true');
      if (requests.length === 3) release();
      // None can finish until all have started: a serialized pool would fail.
      await allStarted;
      return Response.json({
        command: 'SELECT', rowCount: 1,
        fields: [
          { name: 'id', dataTypeID: 2950 },
          { name: 'display_name', dataTypeID: 25 },
          { name: 'updated_at', dataTypeID: 1184 },
        ],
        rows: [['00000000-0000-4000-8000-000000000001', 'Guest family', '2026-10-23 10:11:12.123456+00']],
      });
    });

    const tokens = ['first-token', "guest-token'); DROP TABLE guests; --", 'third-token'];
    const rows = await Promise.all(tokens.map((token) => db.select({
      id: guests.id, displayName: guests.displayName, updatedAt: guests.updatedAt,
    }).from(guests).where(eq(guests.token, token))));

    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map((request) => request.params), tokens.map((token) => [token]));
    for (const request of requests) {
      assert.match(request.query, /"token" = \$1/);
      assert.ok(!request.query.includes(tokens[1]!));
    }
    for (const result of rows) {
      assert.equal(result[0]?.displayName, 'Guest family');
      assert.ok(result[0]?.updatedAt instanceof Date);
      assert.equal(result[0].updatedAt.toISOString(), '2026-10-23T10:11:12.123Z');
    }
    assert.equal(acquire.mock.callCount(), 0);
    assert.equal(pool.hasFetchUnsupportedListeners, false, 'The idle error listener must keep HTTP enabled.');
  });

  it('keeps BEGIN, dependent queries and COMMIT on one acquired WebSocket client', async (t) => {
    const transport = checkedOutClient(t);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select ${'first'}::text`);
      await tx.execute(sql`select ${'second'}::text`);
      return 'saved';
    });

    assert.equal(result, 'saved');
    assert.equal(transport.acquire.mock.callCount(), 1);
    assert.deepEqual(transport.commands, [
      { text: 'begin', values: [] },
      { text: 'select $1::text', values: ['first'] },
      { text: 'select $1::text', values: ['second'] },
      { text: 'commit', values: [] },
    ]);
    assert.equal(transport.releases(), 1);
    assert.ok(transport.client instanceof Client);
    assert.equal(pool.options.max, 4);
  });

  it('rolls back on the same acquired client and always releases it after failure', async (t) => {
    const transport = checkedOutClient(t);
    const failure = new Error('Reject a failed dependent operation.');
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`select ${'before failure'}::text`);
      throw failure;
    }), (error) => error === failure);

    assert.equal(transport.acquire.mock.callCount(), 1);
    assert.deepEqual(transport.commands, [
      { text: 'begin', values: [] },
      { text: 'select $1::text', values: ['before failure'] },
      { text: 'rollback', values: [] },
    ]);
    assert.equal(transport.releases(), 1);
  });
});
