import Link from 'next/link';
import { getConfig } from '@/lib/services/config';
import { getDashboardSummary } from '@/lib/services/dashboard';
import { currentPhase } from '@/lib/domain/phase';
import { formatDateTimeShort } from '@/lib/format';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [config, summary] = await Promise.all([getConfig(), getDashboardSummary()]);
  const now = new Date();
  const phase = currentPhase(now, config.phase);

  return (
    <main>
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <section className="mt-4">
        <h2 className="font-medium">Phase</h2>
        <p>
          Currently <strong>{phase}</strong>
          {config.phase.phaseOverride ? ' (manually overridden)' : ' (derived from dates)'}.{' '}
          <Link href="/admin/config" className="underline">
            Change
          </Link>
        </p>
        <ul className="mt-1 text-sm text-gray-600">
          <li>details open: {formatDateTimeShort(config.phase.detailsOpenAt, config.site.timezone)}</li>
          <li>day of: {formatDateTimeShort(config.phase.dayOfStartAt, config.site.timezone)}</li>
          <li>thank you: {formatDateTimeShort(config.phase.thankYouAt, config.site.timezone)}</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Guests</h2>
        <p>
          {summary.totalGuests} invitations, {summary.respondedGuests} with at least one response.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Responses</h2>
        <table className="mt-2 border-collapse text-sm">
          <thead>
            <tr>
              {['Event', 'Invited', 'Attending', 'Declined', 'No response', 'Headcount'].map((h) => (
                <th key={h} className="border px-2 py-1 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.perEvent.map((row) => (
              <tr key={row.event.slug}>
                <td className="border px-2 py-1">{row.event.name}</td>
                <td className="border px-2 py-1">{row.invited}</td>
                <td className="border px-2 py-1">{row.attending}</td>
                <td className="border px-2 py-1">{row.declined}</td>
                <td className="border px-2 py-1">{row.noResponse}</td>
                <td className="border px-2 py-1">{row.headcount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-sm text-gray-600">
          Invited, attending and declined count invitations. Headcount sums party sizes - that is
          the catering number.
        </p>
      </section>
    </main>
  );
}
