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
import {
  filterAndSortGuests,
  parseTableFilters,
  scopedEventSlugs,
  scopedReplies,
  tableHref,
  type TableSearchParams,
} from '@/lib/domain/admin-tables';
import { summarizeGuests } from '@/lib/services/dashboard';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { getConfig } from '@/lib/services/config';
import { formatDateTimeShort } from '@/lib/format';
import { CountsBlock } from '../_components/counts';
import { AdminPageHeader, EmptyState, StatusBadge } from '../_components/ui';
import { CHANNEL_LABELS, SIDE_LABELS, SOURCE_LABELS } from '../_components/presentation';
import { SortableHead, TableControls } from '../_components/table-controls';
import { RecordResponse, RecordResponseButton, type Candidate } from './record-response';
import { PhoneNumbers } from '../_components/phone-numbers';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<TableSearchParams> };

export default async function AdminRsvpsPage({ searchParams }: Props) {
  const [params, allGuests, events, config] = await Promise.all([
    searchParams,
    listGuests(),
    listEvents(),
    getConfig(),
  ]);
  const filters = parseTableFilters(params, events.map((event) => event.slug), 'rsvps');
  const guests = filterAndSortGuests(allGuests, filters);
  const selectedEvents = events.filter((event) => filters.event === 'all' || filters.event === event.slug);
  const summary = summarizeGuests(guests, selectedEvents);
  const initialGuestId = Array.isArray(params.guest) ? params.guest[0] : params.guest;
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
        <a
          href={tableHref('/api/admin/export/rsvps', filters)}
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download responses
        </a>
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
          Totals follow the households and event selected by the filters below.
        </p>
      </section>
      <RecordResponse
        key={initialGuestId ?? 'record'}
        guests={candidates}
        events={events}
        initialGuestId={initialGuestId}
      />
      <Card>
        <CardContent className="space-y-3">
          <TableControls action="/admin/rsvps" view="rsvps" filters={filters} events={events} />
          <p className="text-xs text-muted-foreground">
            Downloads use the same filters, event and sorting as this table.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {guests.length} of {allGuests.length} {allGuests.length === 1 ? 'household' : 'households'} shown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <EmptyState
              title={allGuests.length === 0 ? 'No guests on the list yet' : 'No households match these filters'}
              description={
                allGuests.length === 0
                  ? 'Add guests to your list to begin recording their replies.'
                  : 'Try another search or clear the filters to see all households.'
              }
            />
          ) : (
            <Table className="admin-table admin-responses">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Guest / Family" column="name" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Family" column="side" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Phone numbers" column="phone" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Channels" column="channels" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Response" column="response" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Attending" column="attending" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Reserved" column="reserved" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Attendee names" column="attendees" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Reply received" column="source" action="/admin/rsvps" filters={filters} />
                  <SortableHead label="Updated" column="replied" action="/admin/rsvps" filters={filters} />
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => {
                  const invitedSlugs = scopedEventSlugs(row, filters);
                  const rowEvents = events.filter((event) => invitedSlugs.includes(event.slug));
                  const replies = scopedReplies(row, filters);
                  const eventReplies = rowEvents.map((event) => ({
                    event,
                    reply: replies.find((reply) => reply.eventSlug === event.slug),
                  }));
                  return (
                    <TableRow key={row.guest.id}>
                      <TableCell><span className="admin-name" title={row.guest.displayName}>{row.guest.displayName}</span></TableCell>
                      <TableCell>{SIDE_LABELS[row.guest.side]}</TableCell>
                      <TableCell><PhoneNumbers value={row.guest.phone} /></TableCell>
                      <TableCell>
                        <div className="admin-cell-badges">
                          {row.channels.map((channel) => <span key={channel.channel} className="admin-channel-tag">{CHANNEL_LABELS[channel.channel]}</span>)}
                          {!row.channels.length && <span className="text-muted-foreground">None</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="admin-cell-lines">
                          {eventReplies.length ? eventReplies.map(({ event, reply }) => (
                            <span key={event.slug} title={event.name}>
                              <StatusBadge tone={!reply ? 'warm' : reply.attending ? 'positive' : 'quiet'}>
                                {!reply ? 'Waiting' : reply.attending ? 'Coming' : 'Declined'}
                              </StatusBadge>
                            </span>
                          )) : <span className="text-muted-foreground">Not invited</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="admin-cell-lines tabular-nums">
                          {eventReplies.length ? eventReplies.map(({ event, reply }) => <span key={event.slug} title={event.name}>{reply?.attending ? reply.partyCount : '—'}</span>) : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{row.guest.maxPartySize}</TableCell>
                      <TableCell>
                        <div className="admin-cell-lines">
                          {eventReplies.length ? eventReplies.map(({ event, reply }) => <span key={event.slug} className="admin-clamp-text" title={reply?.attendeeNames ?? event.name}>{reply?.attendeeNames || '—'}</span>) : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="admin-cell-lines">
                          {eventReplies.length ? eventReplies.map(({ event, reply }) => <span key={event.slug} title={reply?.recordedBy ? 'Recorded by ' + reply.recordedBy : event.name}>{reply ? SOURCE_LABELS[reply.source] : '—'}</span>) : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="admin-cell-lines admin-date">
                          {eventReplies.length ? eventReplies.map(({ event, reply }) => <span key={event.slug} title={event.name}>{reply ? formatDateTimeShort(new Date(reply.updatedAt), config.site.timezone) : '—'}</span>) : '—'}
                        </div>
                      </TableCell>
                      <TableCell><RecordResponseButton guestId={row.guest.id} displayName={row.guest.displayName} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
