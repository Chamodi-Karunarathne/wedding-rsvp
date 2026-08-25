import { toCsv } from '@/lib/domain/csv';
import { qrUrl, shortCodeUrl } from '@/lib/domain/urls';
import { applyFilters, type DashboardFilters } from './dashboard';
import { listGuests } from './guests';
import { listEvents } from './events';

/** PERMANENT. CSV exports. All go through domain/csv, so all carry a BOM. */

/**
 * Feeds the card designer's mail merge.
 *
 * Only guests with a `print` delivery channel. The QR URL is absolute because
 * it is fetched by design software that has no notion of a site root, and it
 * points at the short-code URL that will be printed beside it.
 */
export async function buildPrintExportCsv(origin?: string): Promise<string> {
  const rows = await listGuests();
  const printing = rows.filter((row) => row.channels.some((c) => c.channel === 'print'));

  const header = [
    'display_name',
    'postal_address',
    'short_code',
    'qr_url',
    'invitation_url',
    'max_party_size',
    'side',
  ];

  const body = printing.map((row) => [
    row.guest.displayName,
    row.guest.postalAddress ?? '',
    row.guest.shortCode,
    qrUrl(row.guest.shortCode, origin),
    shortCodeUrl(row.guest.shortCode, origin),
    row.guest.maxPartySize,
    row.guest.side,
  ]);

  return toCsv([header, ...body]);
}

/** Full RSVP state, one row per guest, one column pair per event. */
export async function buildRsvpExportCsv(filters: DashboardFilters = {}): Promise<string> {
  const [allRows, events] = await Promise.all([listGuests(), listEvents()]);
  const rows = applyFilters(allRows, filters);

  const header = [
    'display_name',
    'sort_name',
    'side',
    'phone',
    'short_code',
    'max_party_size',
    'channels',
    ...events.flatMap((event) => [
      `${event.slug}_invited`,
      `${event.slug}_attending`,
      `${event.slug}_party_count`,
      `${event.slug}_attendee_names`,
      `${event.slug}_source`,
    ]),
    'message',
  ];

  const body = rows.map((row) => {
    const eventCells = events.flatMap((event) => {
      const invited = row.eventSlugs.includes(event.slug);
      const rsvp = row.rsvps.find((r) => r.eventSlug === event.slug);
      if (!invited) return ['no', '', '', '', ''];
      if (!rsvp) return ['yes', 'no response', '', '', ''];
      return [
        'yes',
        rsvp.attending ? 'yes' : 'no',
        String(rsvp.partyCount),
        rsvp.attendeeNames ?? '',
        rsvp.source,
      ];
    });

    return [
      row.guest.displayName,
      row.guest.sortName,
      row.guest.side,
      row.guest.phone ?? '',
      row.guest.shortCode,
      row.guest.maxPartySize,
      row.channels.map((c) => `${c.channel}:${c.status}`).join('|'),
      ...eventCells,
      row.message ?? '',
    ];
  });

  return toCsv([header, ...body]);
}

/** The send list, for working through offline. */
export async function buildSendListCsv(origin?: string): Promise<string> {
  const rows = await listGuests();

  const header = [
    'display_name',
    'phone',
    'short_code',
    'invitation_url',
    'channels',
  ];

  const body = rows.map((row) => [
    row.guest.displayName,
    row.guest.phone ?? '',
    row.guest.shortCode,
    shortCodeUrl(row.guest.shortCode, origin),
    row.channels.map((c) => `${c.channel}:${c.status}`).join('|'),
  ]);

  return toCsv([header, ...body]);
}
