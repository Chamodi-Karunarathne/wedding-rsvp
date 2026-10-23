import { asc } from 'drizzle-orm';
import { getDb, type DbLike } from '@/db/client';
import { events } from '@/db/schema';
import { toEventView } from './mappers';
import { listGuests, type GuestListRow } from './guests';
import type { DeliveryChannelName, EventView, RsvpSource, Side } from './types';

/** PERMANENT. Read models for /admin/rsvps. */

export type DashboardFilters = {
  side?: Side | 'all';
  channel?: DeliveryChannelName | 'all';
  /**
   * How the response arrived. Filters the guest LIST and the CSV only - never
   * the counts. "Invited" has no source, so a source-filtered count table
   * would read "invited 500, attending 12" and look like a catastrophe rather
   * than a filter. getDashboardSummary drops this deliberately.
   */
  source?: RsvpSource | 'all';
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
  /** Households matching side and channel. Never narrowed by source. */
  totalGuests: number;
  respondedGuests: number;
  perEvent: EventCounts[];
};

export function applyFilters(rows: GuestListRow[], filters: DashboardFilters): GuestListRow[] {
  const side = filters.side ?? 'all';
  const channel = filters.channel ?? 'all';
  const source = filters.source ?? 'all';

  return rows.filter((row) => {
    if (side !== 'all' && row.guest.side !== side) return false;
    if (channel !== 'all' && !row.channels.some((c) => c.channel === channel)) return false;
    // A household with no response at all has no source, so it drops out of
    // any source filter - which is the intended reading of "show me the ones
    // that came in by phone".
    if (source !== 'all' && !row.rsvps.some((r) => r.source === source)) return false;
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

  return summarizeGuests(allRows, eventRows.map(toEventView), filters);
}

/** Reuse a page's loaded rows for totals without another set of database reads. */
export function summarizeGuests(
  allRows: GuestListRow[],
  eventRows: EventView[],
  filters: DashboardFilters = {},
): DashboardSummary {

  // Source is deliberately not passed on: the counts answer "where do we
  // stand", which a source filter would silently corrupt. See DashboardFilters.
  const rows = applyFilters(allRows, { side: filters.side, channel: filters.channel });

  const perEvent: EventCounts[] = eventRows.map((event) => {
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
    filters: {
      side: filters.side ?? 'all',
      channel: filters.channel ?? 'all',
      source: filters.source ?? 'all',
    },
    totalGuests: rows.length,
    respondedGuests: rows.filter((row) => row.rsvps.length > 0).length,
    perEvent,
  };
}
