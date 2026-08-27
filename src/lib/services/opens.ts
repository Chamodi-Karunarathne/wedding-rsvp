import { sql } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { guestOpens } from '@/db/schema';
import { isCrawler } from '@/lib/domain/crawler';

/**
 * PERMANENT. The only analytics write in the system.
 *
 * Skips link-preview crawlers: WhatsApp fetches every link the moment it is
 * sent, which would otherwise mark all ~500 guests as having opened their
 * invitation before a single person had seen it.
 */
export async function recordOpen(
  guestId: string,
  userAgent: string | null | undefined,
  db: DbLike = getDb(),
): Promise<void> {
  if (isCrawler(userAgent)) return;

  const now = new Date();
  await db
    .insert(guestOpens)
    .values({ guestId, firstOpen: now, lastOpen: now })
    .onConflictDoUpdate({
      target: guestOpens.guestId,
      // COALESCE keeps the original first_open; only last_open moves.
      set: { lastOpen: now, firstOpen: sql`COALESCE(${guestOpens.firstOpen}, ${now})` },
    });
}

export type GuestOpen = { firstOpen: Date | null; lastOpen: Date | null };

/**
 * Every recorded open, keyed by guest.
 *
 * One query for the whole list rather than one per guest: /admin/send needs
 * this for all ~500 households at once, and absence of a key is itself the
 * answer ("nobody has opened it").
 */
export async function listOpens(db: DbLike = getDb()): Promise<Map<string, GuestOpen>> {
  const rows = await db.select().from(guestOpens);
  return new Map(
    rows.map((row) => [row.guestId, { firstOpen: row.firstOpen, lastOpen: row.lastOpen }]),
  );
}
