import { toCsv } from '@/lib/domain/csv';
import { deliveryState } from '@/lib/domain/delivery';
import { invitationUrl } from '@/lib/domain/urls';
import { filterAndSortGuests, parseTableFilters, type TableSearchParams } from '@/lib/domain/admin-tables';
import { listGuests } from './guests';
import { listEvents } from './events';
import { getDb, type DbLike } from '@/db/client';

/** PERMANENT. CSV exports. All go through domain/csv, so all carry a BOM. */

/** Editable household data with the exact columns accepted by guest import. */
export async function buildGuestListCsv(
  db: DbLike = getDb(),
  rawParams: TableSearchParams = {},
): Promise<string> {
  const [allRows, events] = await Promise.all([listGuests(db), listEvents(db)]);
  const filters = parseTableFilters(rawParams, events.map((event) => event.slug), 'guests');
  const rows = filterAndSortGuests(allRows, filters);
  return toCsv([
    ['display_name', 'display_name_fallback', 'sort_name', 'side', 'language',
      'max_party_size', 'phone', 'events', 'channels', 'notes'],
    ...rows.map((row) => [
      row.guest.displayName, row.guest.displayNameFallback, row.guest.sortName,
      row.guest.side, row.guest.language, row.guest.maxPartySize, row.guest.phone,
      row.eventSlugs.join(';'), row.channels.map((channel) => channel.channel).join(';'),
      row.guest.notes,
    ]),
  ]);
}

/** Full RSVP state for the selected households and events, in the displayed order. */
export async function buildRsvpExportCsv(
  rawParams: TableSearchParams = {},
  db: DbLike = getDb(),
): Promise<string> {
  const [allRows, allEvents] = await Promise.all([listGuests(db), listEvents(db)]);
  const filters = parseTableFilters(rawParams, allEvents.map((event) => event.slug), 'rsvps');
  const rows = filterAndSortGuests(allRows, filters);
  const events = allEvents.filter((event) => filters.event === 'all' || filters.event === event.slug);

  const header = [
    'display_name',
    'card_name',
    'sort_name',
    'side',
    'phone',
    'max_party_size',
    'channels',
    ...events.flatMap((event) => [
      `${event.slug}_invited`,
      `${event.slug}_attending`,
      `${event.slug}_party_count`,
      `${event.slug}_attendee_names`,
      `${event.slug}_source`,
      `${event.slug}_recorded_by`,
    ]),
    'message',
    'notes',
  ];

  const body = rows.map((row) => {
    const eventCells = events.flatMap((event) => {
      const invited = row.eventSlugs.includes(event.slug);
      const rsvp = row.rsvps.find((r) => r.eventSlug === event.slug);
      if (!invited) return ['no', '', '', '', '', ''];
      if (!rsvp) return ['yes', 'no response', '', '', '', ''];
      return [
        'yes',
        rsvp.attending ? 'yes' : 'no',
        String(rsvp.partyCount),
        rsvp.attendeeNames ?? '',
        rsvp.source,
        rsvp.recordedBy ?? '',
      ];
    });

    return [
      row.guest.displayName,
      row.guest.cardName,
      row.guest.sortName,
      row.guest.side,
      row.guest.phone ?? '',
      row.guest.maxPartySize,
      row.channels.map((c) => `${c.channel}:${c.status}`).join('|'),
      ...eventCells,
      row.message ?? '',
      row.guest.notes ?? '',
    ];
  });

  return toCsv([header, ...body]);
}

/**
 * The send list, for working through offline.
 *
 * The URL is the invitation link itself: every guest is sent their link
 * personally over WhatsApp or email, including the few who also receive a
 * printed card, because the card does not reference the site.
 */
export async function buildSendListCsv(
  origin?: string,
  rawParams: TableSearchParams = {},
  db: DbLike = getDb(),
): Promise<string> {
  const [allRows, events] = await Promise.all([listGuests(db), listEvents(db)]);
  const filters = parseTableFilters(rawParams, events.map((event) => event.slug), 'send');
  const rows = filterAndSortGuests(allRows, filters);

  const header = [
    'display_name',
    'side',
    'phone',
    'invitation_url',
    'channels',
    'state',
    'first_open',
    'last_open',
    'notes',
  ];

  const body = rows.map((row) => [
    row.guest.displayName,
    row.guest.side,
    row.guest.phone ?? '',
    invitationUrl(row.guest.token, origin),
    row.channels.map((c) => `${c.channel}:${c.status}`).join('|'),
    deliveryState({
      channels: row.channels,
      firstOpen: row.firstOpen,
      hasResponse: row.rsvps.length > 0,
    }),
    row.firstOpen?.toISOString() ?? '',
    row.lastOpen?.toISOString() ?? '',
    row.guest.notes ?? '',
  ]);

  return toCsv([header, ...body]);
}
