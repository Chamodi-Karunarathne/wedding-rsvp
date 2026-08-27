import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DELIVERY_STATES, DELIVERY_STATE_LABELS, deliveryState } from '@/lib/domain/delivery';
import { renderTemplate } from '@/lib/domain/template';
import { invitationUrl, whatsappSendUrl } from '@/lib/domain/urls';
import { formatDate, formatEventDateTime } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { getPrimaryEvent } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { SendRow } from './send-row';

export const dynamic = 'force-dynamic';

export default async function AdminSendPage() {
  const [guests, config, event] = await Promise.all([
    listGuests(),
    getConfig(),
    getPrimaryEvent(),
  ]);

  const zone = config.site.timezone;
  // Filled once for every message rather than per row: the same wedding.
  const sharedVars = {
    brideName: config.site.brideName,
    groomName: config.site.groomName,
    date: event ? formatEventDateTime(event.startsAt, zone) : '',
    rsvpBy: formatDate(config.phase.rsvpDeadline, zone),
  };

  const rows = guests.map((row) => ({
    row,
    state: deliveryState({
      channels: row.channels,
      firstOpen: row.firstOpen,
      hasResponse: row.rsvps.length > 0,
    }),
  }));

  const tally = Object.fromEntries(
    DELIVERY_STATES.map((state) => [state, rows.filter((r) => r.state === state).length]),
  ) as Record<(typeof DELIVERY_STATES)[number], number>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Send</h1>
        <p className="text-sm text-muted-foreground">
          Every guest is sent their own invitation link personally, including the few who also
          receive a printed card &mdash; the card does not reference this site.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Where each invitation has got to</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DELIVERY_STATES.map((state) => (
            <Card key={state}>
              <CardContent className="p-4">
                <dt className="text-sm text-muted-foreground">{DELIVERY_STATE_LABELS[state]}</dt>
                <dd className="font-heading mt-1 text-3xl font-semibold tabular-nums">
                  {tally[state]}
                </dd>
              </CardContent>
            </Card>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Three distinct states, not one. <strong>Sent</strong> means a channel is marked sent or
          delivered. <strong>Opened</strong> means someone actually loaded the invitation &mdash;
          link-preview crawlers are excluded, so WhatsApp fetching the URL does not count.{' '}
          <strong>Responded</strong> means an answer exists, however it arrived. Each household
          shows the furthest point it has reached, so &ldquo;sent&rdquo; here means sent and not
          yet opened &mdash; the ones worth chasing.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Message template</CardTitle>
          <CardDescription>
            Edited at /admin/config, so changing the wording never needs a deploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {config.messaging.whatsappTemplate}
          </pre>
          <a href="/api/admin/export/send" className={buttonVariants({ variant: 'outline' })}>
            Download send list CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>
            Clicking a channel advances it: pending &rarr; sent &rarr; delivered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Name', 'Phone', 'State', 'Link', 'WhatsApp', 'Channels'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ row, state }) => {
                  const url = invitationUrl(row.guest.token);
                  const message = renderTemplate(config.messaging.whatsappTemplate, {
                    ...sharedVars,
                    name: row.guest.cardName,
                    url,
                  });

                  return (
                    <SendRow
                      key={row.guest.id}
                      guestId={row.guest.id}
                      displayName={row.guest.displayName}
                      phone={row.guest.phone}
                      invitationUrl={url}
                      whatsappUrl={
                        row.guest.phone ? whatsappSendUrl(row.guest.phone, message) : null
                      }
                      state={state}
                      channels={row.channels.map((c) => ({
                        channel: c.channel,
                        status: c.status,
                      }))}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
