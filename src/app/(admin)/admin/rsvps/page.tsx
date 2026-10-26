import Link from 'next/link';
import Form from 'next/form';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DELIVERY_CHANNELS, RSVP_SOURCES, SIDES } from '@/db/schema';
import { applyFilters, summarizeGuests } from '@/lib/services/dashboard';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { getConfig } from '@/lib/services/config';
import { formatDateTimeShort } from '@/lib/format';
import type { DeliveryChannelName, RsvpSource, Side } from '@/lib/services/types';
import { CountsBlock } from '../_components/counts';
import { AdminPageHeader, EmptyState, SearchFilters, StatusBadge } from '../_components/ui';
import {
  CHANNEL_LABELS,
  matchesReply,
  matchesSearch,
  SIDE_LABELS,
  SOURCE_LABELS,
} from '../_components/presentation';
import { RecordResponse, RecordResponseButton, type Candidate } from './record-response';
import { PhoneNumbers } from '../_components/phone-numbers';
import { FilterSubmit } from '../_components/filter-submit';

export const dynamic = 'force-dynamic';
type Props = {
  searchParams: Promise<{
    side?: string;
    channel?: string;
    source?: string;
    q?: string;
    status?: string;
    guest?: string;
  }>;
};

export default async function AdminRsvpsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = {
    side: (SIDES as readonly string[]).includes(params.side ?? '')
      ? (params.side as Side)
      : ('all' as const),
    channel: (DELIVERY_CHANNELS as readonly string[]).includes(params.channel ?? '')
      ? (params.channel as DeliveryChannelName)
      : ('all' as const),
    source: (RSVP_SOURCES as readonly string[]).includes(params.source ?? '')
      ? (params.source as RsvpSource)
      : ('all' as const),
  };
  const [allGuests, events, config] = await Promise.all([
    listGuests(),
    listEvents(),
    getConfig(),
  ]);
  const summary = summarizeGuests(allGuests, events, filters);
  const query = params.q ?? '';
  const status = params.status ?? 'all';
  const guests = applyFilters(allGuests, filters).filter(
    (row) => matchesSearch(row, query) && matchesReply(row, status),
  );
  const exportQuery = new URLSearchParams();
  if (filters.side !== 'all') exportQuery.set('side', filters.side);
  if (filters.channel !== 'all') exportQuery.set('channel', filters.channel);
  if (filters.source !== 'all') exportQuery.set('source', filters.source);
  const candidates: Candidate[] = allGuests.map((row) => ({
    id: row.guest.id,
    displayName: row.guest.displayName,
    sortName: row.guest.sortName,
    phone: row.guest.phone,
    maxPartySize: row.guest.maxPartySize,
    invitedSlugs: row.eventSlugs,
    rsvps: row.rsvps,
  }));
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Responses"
        description="See who is coming, how many people to expect, and who still needs to reply."
      >
        <RecordResponseButton>Record a phone reply</RecordResponseButton>
      </AdminPageHeader>
      <section aria-label="Response totals" className="space-y-3">
        {summary.perEvent.map((counts) => (
          <CountsBlock
            key={counts.event.slug}
            counts={counts}
            named={summary.perEvent.length > 1}
          />
        ))}
        <p className="text-xs text-muted-foreground">
          Totals include all reply statuses and reply methods for the selected family and sending
          method. The guest search only narrows the list below.
        </p>
      </section>
      <RecordResponse
        key={params.guest ?? 'record'}
        guests={candidates}
        events={events}
        initialGuestId={params.guest}
      />
      <Card>
        <CardContent>
          <SearchFilters
            key={query + status + JSON.stringify(filters)}
            action="/admin/rsvps"
            query={query}
            filters={[
              {
                name: 'status',
                label: 'Response',
                value: status,
                options: [
                  { value: 'all', label: 'All responses' },
                  { value: 'coming', label: 'Coming' },
                  { value: 'declined', label: 'Unable to attend' },
                  { value: 'waiting', label: 'Waiting for reply' },
                ],
              },
              {
                name: 'side',
                label: 'Family',
                value: filters.side,
                options: [
                  { value: 'all', label: 'Both sides' },
                  ...SIDES.map((value) => ({ value, label: SIDE_LABELS[value] })),
                ],
              },
            ]}
          >
            <input type="hidden" name="channel" value={filters.channel} />
            <input type="hidden" name="source" value={filters.source} />
          </SearchFilters>
        </CardContent>
      </Card>
      <details className="admin-disclosure">
        <summary>More filters and download</summary>
        <div className="admin-disclosure-body space-y-4">
          <Form action="/admin/rsvps" className="admin-filters">
            <input type="hidden" name="q" value={query} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="side" value={filters.side} />
            <div className="admin-filter">
              <label htmlFor="reply-method">Reply received</label>
              <select
                key={filters.source}
                className="admin-select"
                id="reply-method"
                name="source"
                defaultValue={filters.source}
              >
                <option value="all">Online or by phone</option>
                {RSVP_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {SOURCE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-filter">
              <label htmlFor="sending-method">Invitation sent by</label>
              <select
                key={filters.channel}
                className="admin-select"
                id="sending-method"
                name="channel"
                defaultValue={filters.channel}
              >
                <option value="all">Any sending method</option>
                {DELIVERY_CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {CHANNEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <FilterSubmit label="Apply filters" />
          </Form>
          <div className="space-y-2">
            <a
              href={'/api/admin/export/rsvps?' + exportQuery}
              className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
            >
              Download responses
            </a>
            <p className="text-xs text-muted-foreground">
              Includes all guest names and reply statuses for the selected family, sending method
              and reply method. Search and response status do not narrow this download.
            </p>
          </div>
        </div>
      </details>
      <Card>
        <CardHeader>
          <CardTitle>
            {guests.length} {guests.length === 1 ? 'household' : 'households'} shown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <EmptyState
              title={
                query
                  ? 'No guests found for “' + query + '”'
                  : status === 'waiting' &&
                      filters.side === 'all' &&
                      filters.channel === 'all' &&
                      filters.source === 'all'
                    ? 'No guests waiting for a reply'
                    : 'No replies match these filters'
              }
              description={
                status === 'waiting' &&
                !query &&
                filters.side === 'all' &&
                filters.channel === 'all' &&
                filters.source === 'all'
                  ? 'Every invited household has replied.'
                  : 'Try another search, response or family.'
              }
            />
          ) : (
            <Table className="admin-table admin-responses">
              <TableHeader>
                <TableRow>
                  {[
                    'Guest / Family', 'Family', 'Phone numbers', 'Channels', 'Response',
                    'Attending', 'Reserved', 'Attendee names', 'Reply received', 'Updated', 'Actions',
                  ].map((heading) => (
                    <TableHead key={heading}>{heading}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => (
                  <TableRow key={row.guest.id}>
                    <TableCell><span className="admin-name" title={row.guest.displayName}>{row.guest.displayName}</span></TableCell>
                    <TableCell>{SIDE_LABELS[row.guest.side]}</TableCell>
                    <TableCell><PhoneNumbers value={row.guest.phone} /></TableCell>
                    <TableCell><div className="admin-cell-badges">{row.channels.map(channel => <span key={channel.channel} className="admin-channel-tag">{CHANNEL_LABELS[channel.channel]}</span>)}{!row.channels.length && <span className="text-muted-foreground">None</span>}</div></TableCell>
                    <TableCell><div className="admin-cell-lines">{row.eventSlugs.length ? events.filter(event => row.eventSlugs.includes(event.slug)).map(event => {
                      const reply = row.rsvps.find(value => value.eventSlug === event.slug);
                      return <span key={event.slug} title={event.name}><StatusBadge tone={!reply ? 'warm' : reply.attending ? 'positive' : 'quiet'}>{!reply ? 'Waiting' : reply.attending ? 'Coming' : 'Declined'}</StatusBadge></span>;
                    }) : <span className="text-muted-foreground">Not invited</span>}</div></TableCell>
                    <TableCell><div className="admin-cell-lines tabular-nums">{row.rsvps.length ? row.rsvps.map(reply => <span key={reply.eventSlug}>{reply.attending ? reply.partyCount : '—'}</span>) : '—'}</div></TableCell>
                    <TableCell className="tabular-nums">{row.guest.maxPartySize}</TableCell>
                    <TableCell><div className="admin-cell-lines">{row.rsvps.some(reply => reply.attendeeNames) ? row.rsvps.map(reply => <span key={reply.eventSlug} className="admin-clamp-text" title={reply.attendeeNames ?? undefined}>{reply.attendeeNames ?? '—'}</span>) : <span className="text-muted-foreground">—</span>}</div></TableCell>
                    <TableCell><div className="admin-cell-lines">{row.rsvps.length ? row.rsvps.map(reply => <span key={reply.eventSlug} title={reply.recordedBy ? 'Recorded by ' + reply.recordedBy : undefined}>{SOURCE_LABELS[reply.source]}</span>) : '—'}</div></TableCell>
                    <TableCell><div className="admin-cell-lines admin-date">{row.rsvps.length ? row.rsvps.map(reply => <span key={reply.eventSlug}>{formatDateTimeShort(new Date(reply.updatedAt), config.site.timezone)}</span>) : '—'}</div></TableCell>
                    <TableCell><RecordResponseButton guestId={row.guest.id} displayName={row.guest.displayName} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
