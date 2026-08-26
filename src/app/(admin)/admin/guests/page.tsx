import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { CsvImport } from './csv-import';
import { GuestRow } from './guest-row';
import { GuestEditor } from './guest-editor';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const dynamic = 'force-dynamic';

export default async function AdminGuestsPage() {
  const [guests, events] = await Promise.all([listGuests(), listEvents()]);

  return (
    <main>
      <h1 className="text-xl font-semibold">Guests</h1>
      <p className="text-sm text-gray-600">
        {guests.length} invitations. One row per invitation - never one per person, never one per
        delivery channel.
      </p>

      <section className="mt-6">
        <h2 className="font-medium">Add a guest</h2>
        <div className="mt-2">
          <GuestEditor events={events} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Import CSV</h2>
        <div className="mt-2">
          <CsvImport events={events} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">All guests</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Name', 'Side', 'Party', 'Code', 'Events', 'Responses', 'Channels', ''].map((h) => (
                <th key={h} className="border px-2 py-1 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guests.map((row) => (
              <GuestRow key={row.guest.id} row={row} events={events} />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
