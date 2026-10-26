import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DELIVERY_STATES } from '@/lib/domain/delivery';
import {
  filterAndSortGuests,
  parseTableFilters,
  tableHref,
  type TableSearchParams,
} from '@/lib/domain/admin-tables';
import { renderTemplate } from '@/lib/domain/template';
import { invitationUrl } from '@/lib/domain/urls';
import { splitPhoneNumbers } from '@/lib/domain/phone';
import { formatDate, formatDateTimeShort, formatEventDateTime } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { SendRow } from './send-row';
import { AdminPageHeader, EmptyState } from '../_components/ui';
import { INVITATION_LABELS, invitationStatus } from '../_components/presentation';
import { SortableHead, TableControls } from '../_components/table-controls';
import { WorkflowDialog } from '../_components/workflow-dialog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<TableSearchParams> };
const hints = {
  not_sent: 'No sending record or reply yet',
  sent: 'Marked sent, not opened or replied',
  opened: 'Opened their link, not replied yet',
  responded: 'A reply is recorded online or by phone',
};

export default async function AdminSendPage({ searchParams }: Props) {
  const [guests, config, events, params] = await Promise.all([
    listGuests(),
    getConfig(),
    listEvents(),
    searchParams,
  ]);
  const filters = parseTableFilters(params, events.map((event) => event.slug), 'send');
  const query = filters.q;
  const stateFilter = filters.state;
  const event = events[0];
  const sharedVars = {
    brideName: config.site.brideName,
    groomName: config.site.groomName,
    date: event ? formatEventDateTime(event.startsAt, config.site.timezone) : '',
    rsvpBy: formatDate(config.phase.rsvpDeadline, config.site.timezone),
  };
  const rows = filterAndSortGuests(guests, { ...filters, state: 'all' })
    .map((row) => ({ row, state: invitationStatus(row) }));
  const missingPhoneCount = filterAndSortGuests(guests, { ...filters, state: 'needs_phone' }).length;
  const filtered = filterAndSortGuests(guests, filters);
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Invitations"
        description="Send a personal invitation and see who has opened their link or replied."
      >
        <WorkflowDialog title="Invitation messages" label="Message templates" description="Personalized WhatsApp and plain text templates used for each household.">
          <h3 className="font-semibold">WhatsApp</h3><p className="whitespace-pre-wrap rounded-xl bg-muted p-4">{config.messaging.whatsappTemplate}</p>
          <h3 className="font-semibold">Other channels · plain text</h3><p className="whitespace-pre-wrap rounded-xl bg-muted p-4">{config.messaging.plainTextTemplate}</p>
          <Link href="/admin/config#invitation-message" className={buttonVariants({ variant: 'outline' })}>Edit message templates</Link>
        </WorkflowDialog>
        <a
          href={tableHref('/api/admin/export/send', filters)}
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download invitation list
        </a>
      </AdminPageHeader>
      {missingPhoneCount > 0 && <p className="admin-warning"><Link href={tableHref('/admin/send', filters, { state: 'needs_phone' })} className="underline">{missingPhoneCount} {missingPhoneCount === 1 ? 'household needs' : 'households need'} a WhatsApp phone number.</Link> Add a number or choose another channel in sending details.</p>}
      <section aria-label="Invitation progress">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DELIVERY_STATES.map((state) => (
            <Link
              key={state}
              href={tableHref('/admin/send', filters, { state })}
              className="rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card
                className={stateFilter === state ? 'admin-stat admin-stat-highlight' : 'admin-stat'}
              >
                <CardContent>
                  <span className="text-sm font-medium">{INVITATION_LABELS[state]}</span>
                  <strong>{rows.filter((row) => row.state === state).length}</strong>
                  <p>{hints[state]}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Each household appears at its furthest point: Not sent → Sent → Opened → Replied. A phone
          reply counts as Replied even if the link was never opened. Counts follow the filters
          below except invitation progress.
        </p>
      </section>
      <Card>
        <CardContent className="space-y-4">
          <TableControls action="/admin/send" view="send" filters={filters} events={events} />
          <p className="text-sm text-muted-foreground">
            WhatsApp opens a ready-to-send message. Send it there, then mark it as sent here.
            Opening WhatsApp does not update the sending record.
          </p>
          <p className="text-xs text-muted-foreground">
            Last opened is the latest recorded visible visit or return to the invitation.
            Admin visits and link previews do not count. Times use {config.site.timezone.replaceAll('_', ' ')}.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} of {guests.length} {guests.length === 1 ? 'invitation' : 'invitations'} shown
            {stateFilter !== 'all'
              ? ' · ' + (stateFilter === 'needs_phone' ? 'WhatsApp phone missing' : INVITATION_LABELS[stateFilter as keyof typeof INVITATION_LABELS] ?? 'All')
              : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title={
                query
                  ? 'No guests found for “' + query + '”'
                  : guests.length === 0
                    ? 'No invitations here yet'
                    : 'No invitations match these filters'
              }
              description={
                guests.length === 0
                  ? 'Add guests to your list to prepare their personal invitations.'
                  : 'Try another search or clear the filters.'
              }
            />
          ) : (
            <Table className="admin-table admin-invitations">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Guest / Family" column="name" action="/admin/send" filters={filters} />
                  <SortableHead label="Which side" column="side" action="/admin/send" filters={filters} />
                  <SortableHead label="Phone numbers" column="phone" action="/admin/send" filters={filters} />
                  <SortableHead label="Channels" column="channels" action="/admin/send" filters={filters} />
                  <SortableHead label="Progress" column="state" action="/admin/send" filters={filters} />
                  <SortableHead label="Last opened" column="opened" action="/admin/send" filters={filters} />
                  <TableHead>Invitation</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const url = invitationUrl(row.guest.token);
                  const message = renderTemplate(config.messaging.whatsappTemplate, {
                    ...sharedVars,
                    name: row.guest.cardName,
                    url,
                  });
                  const plainMessage = renderTemplate(config.messaging.plainTextTemplate, {
                    ...sharedVars, name: row.guest.cardName, url,
                  });
                  return (
                    <SendRow
                      key={row.guest.id}
                      guestId={row.guest.id}
                      displayName={row.guest.displayName}
                      side={row.guest.side}
                      phone={row.guest.phone}
                      invitationUrl={url}
                      message={message}
                      plainMessage={plainMessage}
                      whatsappNumbers={splitPhoneNumbers(row.guest.phone)}
                      state={invitationStatus(row)}
                      firstOpenedAt={row.firstOpen ? formatDateTimeShort(row.firstOpen, config.site.timezone, 'en-GB', 'second') : null}
                      lastOpenedAt={row.lastOpen ? formatDateTimeShort(row.lastOpen, config.site.timezone, 'en-GB', 'second') : null}
                      openedAtIso={(row.lastOpen ?? row.firstOpen)?.toISOString() ?? null}
                      channels={row.channels.map((channel) => ({
                        channel: channel.channel,
                        status: channel.status,
                      }))}
                    />
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
