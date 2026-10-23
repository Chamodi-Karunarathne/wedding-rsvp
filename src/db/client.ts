import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.ts';

/**
 * PERMANENT. The only place a database connection is constructed for the app.
 *
 * Standalone queries use Neon's low-latency HTTP transport. Drizzle's
 * interactive transactions acquire a WebSocket client with Pool.connect(),
 * keeping validation, locks and all writes on that one connection.
 *
 * Next.js loads .env itself, so this file must never import ./load-env.
 */

export type Db = NeonDatabase<typeof schema>;

/** The handle passed to a db.transaction() callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Accept either, so a helper can be called inside or outside a transaction. */
export type DbLike = Db | Tx;

// Neon's driver needs a WebSocket implementation. Node 22+ and the Edge
// runtime both provide one globally, which is why `ws` is not a dependency.
if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = globalThis.WebSocket as never;
}

// Pool.query() uses HTTP; Pool.connect() still uses WebSockets. This avoids
// paying for a WebSocket handshake on admin reads and lets Promise.all reads
// run concurrently. Do not add connect/acquire/release/remove listeners: the
// Neon driver falls back to WebSockets when those listeners are present.
// Use the standard Neon pooled URL: HTTP queries do not apply session startup
// options from its query string (e.g. options or statement_timeout).
neonConfig.poolQueryViaFetch = true;
// Keep database reads fresh even outside a force-dynamic route. Resolve fetch
// at call time so Next's request-aware implementation is used in production.
neonConfig.fetchFunction = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(input, { ...init, cache: 'no-store' });

type Cache = { pool?: Pool; db?: Db };

// Survives HMR in dev, which would otherwise leak a pool per reload.
const cache: Cache = ((globalThis as { __weddingDb?: Cache }).__weddingDb ??= {});

export function getDb(): Db {
  if (cache.db) return cache.db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
    );
  }

  // Vercel can run concurrent requests in one instance. Bound the pool used
  // by interactive transactions, without making unrelated writes wait for a
  // single connection. Ordinary HTTP queries do not occupy these slots.
  cache.pool = new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 10_000,
  });
  // Only the error event keeps HTTP queries enabled. Avoid an unhandled idle
  // socket error, and never log driver errors that may contain credentials.
  cache.pool.on('error', () => console.error('A database connection failed while idle.'));
  cache.db = drizzle(cache.pool, { schema });
  return cache.db;
}
