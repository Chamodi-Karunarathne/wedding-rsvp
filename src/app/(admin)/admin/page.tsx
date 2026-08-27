import Link from 'next/link';
import { getConfig } from '@/lib/services/config';
import { getDashboardSummary } from '@/lib/services/dashboard';
import { currentPhase } from '@/lib/domain/phase';
import { formatDateTimeShort } from '@/lib/format';
import { CountsBlock } from './_components/counts';

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
        <div className="mt-2 space-y-4">
          {summary.perEvent.map((row) => (
            <CountsBlock key={row.event.slug} counts={row} named={summary.perEvent.length > 1} />
          ))}
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Invited, attending and declined count invitations. Headcount sums party sizes - that is
          the catering number.
        </p>
      </section>
    </main>
  );
}
