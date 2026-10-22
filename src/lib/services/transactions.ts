import { eq } from 'drizzle-orm';
import type { DbLike, Tx } from '@/db/client';
import { guests } from '@/db/schema';
import type { Err, Result, ServiceError } from '@/lib/domain/result';

class CommandFailure extends Error {
  readonly result: Err<ServiceError>;

  constructor(result: Err<ServiceError>) {
    super(result.error.message);
    this.result = result;
  }
}

/**
 * A failed Result must abort SQL writes too. A supplied transaction gets a
 * savepoint, so commands remain safe both on their own and inside an import.
 * Infrastructure errors keep their original exception for the caller to handle.
 */
export async function withTransaction<T>(
  db: DbLike,
  command: (tx: Tx) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await db.transaction(async (tx) => {
      const result = await command(tx);
      if (!result.ok) throw new CommandFailure(result);
      return result;
    });
  } catch (error) {
    if (error instanceof CommandFailure) return error.result;
    throw error;
  }
}

/**
 * Every allowance/invitation edit and RSVP takes this same row lock before
 * reading mutable validation inputs. It also serializes first responses, where
 * an RSVP row does not yet exist and therefore cannot itself be locked.
 */
export async function lockGuest(tx: Tx, lookup: { id: string } | { token: string }) {
  const [row] = await tx
    .select()
    .from(guests)
    .where('id' in lookup ? eq(guests.id, lookup.id) : eq(guests.token, lookup.token))
    .limit(1)
    .for('update');
  return row ?? null;
}
