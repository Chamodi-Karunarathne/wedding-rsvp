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
