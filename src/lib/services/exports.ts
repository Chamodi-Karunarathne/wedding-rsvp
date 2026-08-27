import { toCsv } from '@/lib/domain/csv';
import { deliveryState } from '@/lib/domain/delivery';
import { invitationUrl } from '@/lib/domain/urls';
import { applyFilters, type DashboardFilters } from './dashboard';
import { listGuests } from './guests';
import { listEvents } from './events';

/** PERMANENT. CSV exports. All go through domain/csv, so all carry a BOM. */

/** Full RSVP state, one row per guest, one column pair per event. */
export async function buildRsvpExportCsv(filters: DashboardFilters = {}): Promise<string> {
  const [allRows, events] = await Promise.all([listGuests(), listEvents()]);
  const rows = applyFilters(allRows, filters);

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
export async function buildSendListCsv(origin?: string): Promise<string> {
  const rows = await listGuests();

  const header = [
    'display_name',
    'phone',
    'invitation_url',
    'channels',
    'state',
    'first_open',
    'notes',
  ];

  const body = rows.map((row) => [
    row.guest.displayName,
    row.guest.phone ?? '',
    invitationUrl(row.guest.token, origin),
    row.channels.map((c) => `${c.channel}:${c.status}`).join('|'),
    deliveryState({
      channels: row.channels,
      firstOpen: row.firstOpen,
      hasResponse: row.rsvps.length > 0,
    }),
    row.firstOpen?.toISOString() ?? '',
    row.guest.notes ?? '',
  ]);

  return toCsv([header, ...body]);
}
