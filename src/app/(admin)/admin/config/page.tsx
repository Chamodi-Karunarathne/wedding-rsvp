import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Config</h1>
        <p className="text-sm text-muted-foreground">
          Times are entered and shown in {zone}, the wedding&apos;s timezone &mdash; not yours.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The wedding itself</CardTitle>
          <CardDescription>
            Read-only here on purpose. The event row is the single source of truth for when and
            where the wedding is &mdash; everything above the data layer asks{' '}
            <code className="font-mono text-xs">getPrimaryEvent()</code> rather than keeping a
            second copy of the date that can drift from this one. Change it in the database, or
            seed it from <code className="font-mono text-xs">WEDDING_EVENT_DATE</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event ? (
            <p>
              <strong>{event.name}</strong>, {formatEventDateTime(event.startsAt, zone)} &mdash;{' '}
              {event.venueName}, {event.venueAddress}
            </p>
          ) : (
            <p className="text-destructive">
              No event exists yet. Run <code className="font-mono text-xs">pnpm db:seed</code>.
            </p>
          )}
        </CardContent>
      </Card>

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
  );
}
