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

/**
 * The single seeded event.
 *
 * There is exactly one - a Poruwa ceremony - but the events table is not
 * collapsed, so this is a read rather than a constant. Every caller above the
 * data layer goes through here instead of hardcoding a slug; the day a second
 * event is added, nothing above needs to learn a new name.
 *
 * Null only when the database has no events at all, i.e. it has been migrated
 * but never seeded.
 */
export async function getPrimaryEvent(db: DbLike = getDb()): Promise<EventView | null> {
  const [row] = await db
    .select()
    .from(events)
    .orderBy(asc(events.sortOrder), asc(events.startsAt))
    .limit(1);
  return row ? toEventView(row) : null;
}

export async function findEventBySlug(
  slug: string,
  db: DbLike = getDb(),
): Promise<EventView | null> {
  const [row] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return row ? toEventView(row) : null;
}
