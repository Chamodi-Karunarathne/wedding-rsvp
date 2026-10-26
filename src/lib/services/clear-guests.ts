import { count, sql } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { guests } from '@/db/schema';
import { ok, serviceError, type Result } from '@/lib/domain/result';
import { withTransaction } from './transactions';

export async function guestCount(db: DbLike = getDb()): Promise<number> {
  const [row] = await db.select({ value: count() }).from(guests);
  return row?.value ?? 0;
}

/** Delete households and their dependent records while keeping the wedding configured. */
export async function clearAllGuests(
  input: { confirmation: string; expectedCount: number },
  db: DbLike = getDb(),
): Promise<Result<{ deleted: number }>> {
  if (input.confirmation !== 'DELETE ALL GUESTS' || !Number.isSafeInteger(input.expectedCount) || input.expectedCount < 0) {
    return serviceError('validation', 'Type DELETE ALL GUESTS and confirm the current household count.');
  }
  return withTransaction(db, async tx => {
    // Imports hold this same advisory lock for the complete apply transaction.
    await tx.execute(sql`select pg_advisory_xact_lock(19088743, 918273)`);
    // Also wait for existing SELECT FOR UPDATE holders before deleting. A
    // weaker table lock can deadlock when their next statement updates guests.
    await tx.execute(sql`lock table ${guests} in exclusive mode`);
    const current = await guestCount(tx);
    if (current !== input.expectedCount) {
      return serviceError('conflict', 'The guest list changed. Refresh this page and review its current count before clearing it.');
    }
    const removed = await tx.delete(guests).returning({ id: guests.id });
    return ok({ deleted: removed.length });
  });
}
