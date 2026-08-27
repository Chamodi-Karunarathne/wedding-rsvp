import { renderTemplate } from '@/lib/domain/config';
import { invitationUrl, whatsappSendUrl } from '@/lib/domain/urls';
import { getConfig } from '@/lib/services/config';
import { listGuests } from '@/lib/services/guests';
import { SendRow } from './send-row';

export const dynamic = 'force-dynamic';

export default async function AdminSendPage() {
  const [guests, config] = await Promise.all([listGuests(), getConfig()]);

  return (
    <main>
      <h1 className="text-xl font-semibold">Send</h1>
      <p className="text-sm text-gray-600">
        Every guest is sent their own invitation link personally, including the few who also
        receive a printed card. Clicking a channel advances it: pending &rarr; sent &rarr;
        delivered.
      </p>
      <p className="mt-1 text-sm">
        <a href="/api/admin/export/send" className="underline">
          Download send list CSV
        </a>
      </p>

      <div className="mt-3 border p-2 text-sm">
        <strong>Message template</strong>
        <pre className="mt-1 text-xs whitespace-pre-wrap">{config.messaging.whatsappTemplate}</pre>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            {['Name', 'Phone', 'Link', 'WhatsApp', 'Channels'].map((h) => (
              <th key={h} className="border px-2 py-1 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {guests.map((row) => {
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
                channels={row.channels.map((c) => ({ channel: c.channel, status: c.status }))}
              />
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
