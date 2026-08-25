import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from '@/db/schema';

/**
 * PERMANENT. The only place a database connection is constructed for the app.
 *
 * Uses Neon's WebSocket driver, not the HTTP one: POST /api/rsvp must write
 * several rows in a single transaction, and the HTTP driver cannot do
 * multi-statement transactions.
 *
 * Next.js loads .env itself, so this file must never import ./load-env.
 */

export type Db = NeonDatabase<typeof schema>;

// Neon's driver needs a WebSocket implementation. Node 22+ and the Edge
// runtime both provide one globally, which is why `ws` is not a dependency.
if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = globalThis.WebSocket as never;
}

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

  // max: 1 because serverless invocations are single-request; a larger pool
  // just holds Neon connections open for nothing.
  cache.pool = new Pool({ connectionString: url, max: 1 });
  cache.db = drizzle(cache.pool, { schema });
  return cache.db;
}
