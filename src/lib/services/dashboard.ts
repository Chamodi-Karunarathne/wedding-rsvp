import { asc } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { events } from '@/db/schema';
import { toEventView } from './mappers';
import { listGuests, type GuestListRow } from './guests';
import type { DeliveryChannelName, EventView, Side } from './types';

/** PERMANENT. Read models for /admin/rsvps. */

export type DashboardFilters = {
  side?: Side | 'all';
  channel?: DeliveryChannelName | 'all';
};

export type EventCounts = {
  event: EventView;
  /** Households invited, not people. */
  invited: number;
  attending: number;
  declined: number;
  noResponse: number;
  /** Sum of party_count across attending households - the catering number. */
  headcount: number;
};

export type DashboardSummary = {
  filters: Required<DashboardFilters>;
  totalGuests: number;
  respondedGuests: number;
  perEvent: EventCounts[];
};

export function applyFilters(rows: GuestListRow[], filters: DashboardFilters): GuestListRow[] {
  const side = filters.side ?? 'all';
  const channel = filters.channel ?? 'all';

  return rows.filter((row) => {
    if (side !== 'all' && row.guest.side !== side) return false;
    if (channel !== 'all' && !row.channels.some((c) => c.channel === channel)) return false;
    return true;
  });
}

/**
 * Assembled in memory from the full guest listing rather than in SQL.
 *
 * At ~500 households that is a handful of small queries and a couple of
 * loops, and it keeps the filter logic in one readable place that the CSV
 * export shares. Revisit if this ever needs to serve tens of thousands.
 */
export async function getDashboardSummary(
  filters: DashboardFilters = {},
  db: DbLike = getDb(),
): Promise<DashboardSummary> {
  const [allRows, eventRows] = await Promise.all([
    listGuests(db),
    db.select().from(events).orderBy(asc(events.sortOrder), asc(events.startsAt)),
  ]);

  const rows = applyFilters(allRows, filters);

  const perEvent: EventCounts[] = eventRows.map((eventRow) => {
    const event = toEventView(eventRow);
    let invited = 0;
    let attending = 0;
    let declined = 0;
    let headcount = 0;

    for (const row of rows) {
      if (!row.eventSlugs.includes(event.slug)) continue;
      invited += 1;

      const rsvp = row.rsvps.find((r) => r.eventSlug === event.slug);
      if (!rsvp) continue;

      if (rsvp.attending) {
        attending += 1;
        headcount += rsvp.partyCount;
      } else {
        declined += 1;
      }
    }

    return {
      event,
      invited,
      attending,
      declined,
      noResponse: invited - attending - declined,
      headcount,
    };
  });

  return {
    filters: { side: filters.side ?? 'all', channel: filters.channel ?? 'all' },
    totalGuests: rows.length,
    respondedGuests: rows.filter((row) => row.rsvps.length > 0).length,
    perEvent,
  };
}
