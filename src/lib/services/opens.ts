import { sql } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { guestOpens, guests } from '@/db/schema';
import { isCrawler } from '@/lib/domain/crawler';

export type OpenContext = {
  userAgent: string | null | undefined;
  /**
   * True when this view is not a guest reading their invitation - an admin
   * checking what was sent, or an explicit ?preview=1.
   *
   * Without this, opening a guest's link from /admin/send marks that household
   * as having opened it, and 'opened' versus 'sent' is exactly what decides
   * between resending the link and picking up the phone. The metric is only
   * worth keeping if it means what it says.
   */
  preview?: boolean;
};

/**
 * PERMANENT. A best-effort signal that an invitation link was viewed, not
 * proof of the identity of the person holding that link.
 *
 * Skips link-preview crawlers: WhatsApp fetches every link the moment it is
 * sent, which would otherwise mark all ~500 guests as having opened their
 * invitation before a single person had seen it.
 */
export async function recordOpenByToken(
  token: string,
  context: OpenContext,
  db?: DbLike,
): Promise<void> {
  if (context.preview) return;
  if (isCrawler(context.userAgent)) return;

  // Resolve the token and upsert in one statement. Unknown/deleted links add
  // nothing. The database clock and min/max also preserve both ends when
  // requests on separate app instances finish in a different order.
  await (db ?? getDb()).execute(sql`
    INSERT INTO ${guestOpens} (guest_id, first_open, last_open)
    SELECT ${guests.id}, statement_timestamp(), statement_timestamp()
    FROM ${guests} WHERE ${guests.token} = ${token}
    ON CONFLICT (guest_id) DO UPDATE SET
      first_open = LEAST(${guestOpens.firstOpen}, excluded.first_open),
      last_open = GREATEST(${guestOpens.lastOpen}, excluded.last_open)
  `);
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
