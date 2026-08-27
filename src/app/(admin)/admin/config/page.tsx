import { currentPhase } from '@/lib/domain/phase';
import { formatEventDateTime, toDateTimeLocalValue } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { getPrimaryEvent } from '@/lib/services/events';
import { ConfigForm } from './config-form';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const [config, event] = await Promise.all([getConfig(), getPrimaryEvent()]);
  const zone = config.site.timezone;

  return (
    <main>
      <h1 className="text-xl font-semibold">Config</h1>
      <p className="text-sm text-gray-600">
        Times are entered and shown in {zone}, the wedding&apos;s timezone - not yours.
      </p>

      <section className="mt-4 border p-3 text-sm">
        <h2 className="font-medium">The wedding itself</h2>
        {event ? (
          <p className="mt-1">
            <strong>{event.name}</strong>, {formatEventDateTime(event.startsAt, zone)} &mdash;{' '}
            {event.venueName}, {event.venueAddress}
          </p>
        ) : (
          <p className="mt-1 text-red-700">
            No event exists yet. Run <code>pnpm db:seed</code>.
          </p>
        )}
        <p className="mt-1 text-gray-600">
          Read-only here on purpose. The event row is the single source of truth for when and
          where the wedding is &mdash; everything above the data layer asks{' '}
          <code>getPrimaryEvent()</code> rather than keeping a second copy of the date that can
          drift from this one. Change it in the database, or seed it from{' '}
          <code>WEDDING_EVENT_DATE</code>.
        </p>
      </section>

      <div className="mt-4">
        <ConfigForm
          phase={{
            detailsOpenAt: toDateTimeLocalValue(config.phase.detailsOpenAt, zone),
            rsvpDeadline: toDateTimeLocalValue(config.phase.rsvpDeadline, zone),
            dayOfStartAt: toDateTimeLocalValue(config.phase.dayOfStartAt, zone),
            thankYouAt: toDateTimeLocalValue(config.phase.thankYouAt, zone),
            phaseOverride: config.phase.phaseOverride,
          }}
          site={config.site}
          messaging={config.messaging}
          derivedPhase={currentPhase(new Date(), {
            ...config.phase,
            phaseOverride: null,
          })}
        />
      </div>
    </main>
  );
}
