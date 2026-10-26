import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DELIVERY_STATES } from '@/lib/domain/delivery';
import { renderTemplate } from '@/lib/domain/template';
import { invitationUrl } from '@/lib/domain/urls';
import { splitPhoneNumbers } from '@/lib/domain/phone';
import { formatDate, formatDateTimeShort, formatEventDateTime } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { getPrimaryEvent } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { SendRow } from './send-row';
import { AdminPageHeader, EmptyState, SearchFilters } from '../_components/ui';
import { INVITATION_LABELS, invitationStatus, matchesSearch, needsWhatsAppPhone } from '../_components/presentation';
import { WorkflowDialog } from '../_components/workflow-dialog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ q?: string; state?: string }> };
const hints = {
  not_sent: 'No sending record or reply yet',
  sent: 'Marked sent, not opened or replied',
  opened: 'Opened their link, not replied yet',
  responded: 'A reply is recorded online or by phone',
};

export default async function AdminSendPage({ searchParams }: Props) {
  const [guests, config, event, params] = await Promise.all([
    listGuests(),
    getConfig(),
    getPrimaryEvent(),
    searchParams,
  ]);
  const query = params.q ?? '';
  const stateFilter = params.state ?? 'all';
  const sharedVars = {
    brideName: config.site.brideName,
    groomName: config.site.groomName,
    date: event ? formatEventDateTime(event.startsAt, config.site.timezone) : '',
    rsvpBy: formatDate(config.phase.rsvpDeadline, config.site.timezone),
  };
  const rows = guests.map((row) => ({ row, state: invitationStatus(row) }));
  const filtered = rows.filter(
    ({ row, state }) =>
      matchesSearch(row, query) && (stateFilter === 'all' || stateFilter === state ||
        (stateFilter === 'needs_phone' && needsWhatsAppPhone(row))),
  );
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
          href="/api/admin/export/send"
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download invitation list
        </a>
      </AdminPageHeader>
      {guests.some(needsWhatsAppPhone) && <p className="admin-warning"><Link href="/admin/send?state=needs_phone" className="underline">{guests.filter(needsWhatsAppPhone).length} households need a WhatsApp phone number.</Link> Add a number or choose another channel in sending details.</p>}
      <section aria-label="Invitation progress">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DELIVERY_STATES.map((state) => (
            <Link
              key={state}
              href={'/admin/send?state=' + state}
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
          reply counts as Replied even if the link was never opened.
        </p>
      </section>
      <Card>
        <CardContent className="space-y-4">
          <SearchFilters
            key={query + stateFilter}
            action="/admin/send"
            query={query}
            filters={[
              {
                name: 'state',
                label: 'Invitation progress',
                value: stateFilter,
                options: [
                  { value: 'all', label: 'All invitations' },
                  { value: 'needs_phone', label: 'WhatsApp phone missing' },
                  ...DELIVERY_STATES.map((value) => ({ value, label: INVITATION_LABELS[value] })),
                ],
              },
            ]}
          />
          <p className="text-sm text-muted-foreground">
            WhatsApp opens a ready-to-send message. Send it there, then mark it as sent here.
            Opening WhatsApp does not update the sending record.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} {filtered.length === 1 ? 'invitation' : 'invitations'}
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
                  : stateFilter === 'not_sent'
                    ? 'No invitations waiting to be sent'
                    : 'No invitations here yet'
              }
              description={
                guests.length === 0
                  ? 'Add guests to your list to prepare their personal invitations.'
                  : 'Try another search or choose All invitations.'
              }
            />
          ) : (
            <Table className="admin-table admin-invitations">
              <TableHeader>
                <TableRow>
                  {['Guest / Family', 'Phone numbers', 'Channels', 'Progress', 'Last opened', 'WhatsApp', 'Message', 'Actions'].map((heading) => (
                    <TableHead key={heading}>{heading}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ row, state }) => {
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
                      phone={row.guest.phone}
                      invitationUrl={url}
                      message={message}
                      plainMessage={plainMessage}
                      whatsappNumbers={splitPhoneNumbers(row.guest.phone)}
                      state={state}
                      firstOpenedAt={row.firstOpen ? formatDateTimeShort(row.firstOpen, config.site.timezone) : null}
                      lastOpenedAt={row.lastOpen ? formatDateTimeShort(row.lastOpen, config.site.timezone) : null}
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
