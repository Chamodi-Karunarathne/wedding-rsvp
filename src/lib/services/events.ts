import { asc, eq } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { events } from '@/db/schema';
import { toEventView } from './mappers';
import type { EventView } from './types';

/** PERMANENT. Event reads. Events are created by the seed and edited rarely. */

export async function listEvents(db: DbLike = getDb()): Promise<EventView[]> {
  const rows = await db
    .select()
    .from(events)
    .orderBy(asc(events.sortOrder), asc(events.startsAt));
  return rows.map(toEventView);
}

export async function findEventBySlug(
  slug: string,
  db: DbLike = getDb(),
): Promise<EventView | null> {
  const [row] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return row ? toEventView(row) : null;
}
