import { renderTemplate } from '@/lib/domain/config';
import { DELIVERY_STATES, DELIVERY_STATE_LABELS, deliveryState } from '@/lib/domain/delivery';
import { invitationUrl, whatsappSendUrl } from '@/lib/domain/urls';
import { getConfig } from '@/lib/services/config';
import { listGuests } from '@/lib/services/guests';
import { SendRow } from './send-row';

export const dynamic = 'force-dynamic';

export default async function AdminSendPage() {
  const [guests, config] = await Promise.all([listGuests(), getConfig()]);

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
    <main>
      <h1 className="text-xl font-semibold">Send</h1>
      <p className="text-sm text-gray-600">
        Every guest is sent their own invitation link personally, including the few who also
        receive a printed card &mdash; the card does not reference this site. Clicking a channel
        advances it: pending &rarr; sent &rarr; delivered.
      </p>

      <section className="mt-4 border p-3">
        <h2 className="font-medium">Where each invitation has got to</h2>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          {DELIVERY_STATES.map((state) => (
            <div key={state}>
              <dt className="text-sm text-gray-600">{DELIVERY_STATE_LABELS[state]}</dt>
              <dd className="text-xl font-semibold">{tally[state]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-gray-600">
          Three distinct states, not one. <strong>Sent</strong> means a channel is marked sent or
          delivered. <strong>Opened</strong> means someone actually loaded the invitation &mdash;
          link-preview crawlers are excluded, so WhatsApp fetching the URL does not count.{' '}
          <strong>Responded</strong> means an answer exists, however it arrived. Each household
          shows the furthest point it has reached, so &ldquo;sent&rdquo; here means sent and not
          yet opened &mdash; the ones worth chasing.
        </p>
      </section>

      <p className="mt-3 text-sm">
        <a href="/api/admin/export/send" className="underline">
          Download send list CSV
        </a>
      </p>

      <div className="mt-3 border p-2 text-sm">
        <strong>Message template</strong>
        <pre className="mt-1 text-xs whitespace-pre-wrap">{config.messaging.whatsappTemplate}</pre>
        <p className="mt-1 text-gray-600">
          Edited at{' '}
          <a href="/admin/config" className="underline">
            /admin/config
          </a>
          , so changing the wording never needs a deploy.
        </p>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            {['Name', 'Phone', 'State', 'Link', 'WhatsApp', 'Channels'].map((h) => (
              <th key={h} className="border px-2 py-1 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, state }) => {
            const url = invitationUrl(row.guest.token);
            const message = renderTemplate(config.messaging.whatsappTemplate, {
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
                whatsappUrl={row.guest.phone ? whatsappSendUrl(row.guest.phone, message) : null}
                state={state}
                channels={row.channels.map((c) => ({ channel: c.channel, status: c.status }))}
              />
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
