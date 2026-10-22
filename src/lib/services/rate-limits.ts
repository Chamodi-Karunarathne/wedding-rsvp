import { sql, type SQL } from 'drizzle-orm';
import { apiRateLimits } from '../../db/schema.ts';
import {
  hashRateLimitKey,
  type RateLimitDecision,
  type RateLimitEntry,
  type RateLimitPolicy,
  type RateLimitStore,
} from '../domain/rate-limit.ts';

type Execute = (query: SQL) => Promise<{ rows: unknown[] }>;
export type RateLimitDatabase = {
  execute: Execute;
  transaction<T>(command: (execute: Execute) => Promise<T>): Promise<T>;
};

class AllowanceDenied extends Error {
  readonly decision: RateLimitDecision;
  constructor(decision: RateLimitDecision) {
    super('Rate-limit allowance denied.');
    this.decision = decision;
  }
}

/**
 * One atomic UPSERT, using the database clock rather than an instance's clock.
 * PostgreSQL serializes conflicting updates, so parallel instances cannot each
 * spend the same final allowance. Denied counters saturate at limit + 1.
 */
export function rateLimitQuery(policy: RateLimitPolicy, keyHash: string): SQL {
  const { scope, limit, windowSeconds } = policy;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit >= 1_000_000 ||
      !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400 ||
      !/^[a-f0-9]{64}$/.test(keyHash)) {
    throw new Error('Invalid rate-limit policy or key.');
  }

  // Cleanup is bounded and only global buckets perform it. Excluding global
  // rows avoids lock cycles between cleanup and concurrent global UPSERTs.
  // SKIP LOCKED leaves another request's active counter alone.
  const cleanup = scope.endsWith('-global') ? sql`
    WITH expired_keys AS MATERIALIZED (
      SELECT ${apiRateLimits.scope}, ${apiRateLimits.keyHash} FROM ${apiRateLimits}
      WHERE ${apiRateLimits.windowEndsAt} < statement_timestamp() - interval '1 day'
        AND ${apiRateLimits.scope} NOT LIKE '%-global'
      ORDER BY ${apiRateLimits.windowEndsAt}
      LIMIT 32 FOR UPDATE SKIP LOCKED
    ), expired AS (
      DELETE FROM ${apiRateLimits} USING expired_keys
      WHERE ${apiRateLimits.scope} = expired_keys.scope
        AND ${apiRateLimits.keyHash} = expired_keys.key_hash
    )` : sql``;
  const windowEnd = sql`to_timestamp(
    (floor(extract(epoch FROM statement_timestamp()) / ${windowSeconds}) + 1) * ${windowSeconds}
  )`;

  return sql`${cleanup}
    INSERT INTO ${apiRateLimits} ("scope", "key_hash", "requests", "window_ends_at")
    VALUES (${scope}, ${keyHash}, 1, ${windowEnd})
    ON CONFLICT ("scope", "key_hash") DO UPDATE SET
      "requests" = CASE
        WHEN ${apiRateLimits.windowEndsAt} <= statement_timestamp() THEN 1
        ELSE LEAST(${apiRateLimits.requests} + 1, ${limit + 1}) END,
      "window_ends_at" = CASE
        WHEN ${apiRateLimits.windowEndsAt} <= statement_timestamp() THEN ${windowEnd}
        ELSE ${apiRateLimits.windowEndsAt} END
    RETURNING "requests" <= ${limit} AS "allowed",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("window_ends_at" - statement_timestamp()))))::integer
        AS "retryAfterSeconds"
  `;
}

async function consumeEntry(execute: Execute, { policy, identifier }: RateLimitEntry): Promise<RateLimitDecision> {
  const result = await execute(rateLimitQuery(policy, hashRateLimitKey(policy.scope, identifier)));
  const row = result.rows[0] as Partial<RateLimitDecision> | undefined;
  if (typeof row?.allowed !== 'boolean' ||
      !Number.isSafeInteger(row.retryAfterSeconds) ||
      row.retryAfterSeconds! < 1 || row.retryAfterSeconds! > policy.windowSeconds) {
    throw new Error('Invalid rate-limit database response.');
  }
  return { allowed: row.allowed, retryAfterSeconds: row.retryAfterSeconds! };
}

/** A transaction implementation is required; batches never fall back to sequential commits. */
export function createPostgresRateLimitStore(database: RateLimitDatabase): RateLimitStore {
  return {
    consume(policy, identifier) {
      return consumeEntry(database.execute, { policy, identifier });
    },
    async consumeAll(entries) {
      if (!entries.length) throw new Error('A rate-limit batch cannot be empty.');
      try {
        return await database.transaction(async (execute) => {
          let decision: RateLimitDecision = { allowed: true, retryAfterSeconds: 1 };
          for (const entry of entries) {
            decision = await consumeEntry(execute, entry);
            if (!decision.allowed) throw new AllowanceDenied(decision);
          }
          return decision;
        });
      } catch (error) {
        // Throw inside the transaction and return the denial only after its
        // rollback. No global budget is spent on an already limited IP, and
        // globally denied requests cannot persist fresh per-IP identities.
        if (error instanceof AllowanceDenied) return error.decision;
        throw error;
      }
    },
  };
}

export const postgresRateLimitStore = createPostgresRateLimitStore({
  async execute(query) {
    // Lazy imports keep offline tests independent of credentials/Next aliases.
    const { getDb } = await import('@/db/client');
    return getDb().execute(query);
  },
  async transaction(command) {
    const { getDb } = await import('@/db/client');
    return getDb().transaction((tx) => command((query) => tx.execute(query)));
  },
});
