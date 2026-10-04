import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currentPhase } from '@/lib/domain/phase';
import { formatDate, formatEventDateTime, toDateTimeLocalValue } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { getPrimaryEvent } from '@/lib/services/events';
import { ConfigForm } from './config-form';
import { AdminPageHeader, EmptyState } from '../_components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const [config, event] = await Promise.all([getConfig(), getPrimaryEvent()]);
  const zone = config.site.timezone;
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wedding Details"
        description="Update the names, reply contacts and invitation message your guests see."
      />
      <Card>
        <CardHeader>
          <CardTitle>The celebration</CardTitle>
          <CardDescription>
            Date and venue are fixed here. If they need changing, contact the person who set up the
            website.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Wedding</dt>
                <dd className="mt-1 font-medium">{event.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Date and time</dt>
                <dd className="mt-1">{formatEventDateTime(event.startsAt, zone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Venue</dt>
                <dd className="mt-1">{event.venueName}</dd>
                <dd className="text-sm text-muted-foreground">{event.venueAddress}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Local wedding time</dt>
                <dd className="mt-1">{zone.replaceAll('_', ' ')}</dd>
                {event.dressCode && (
                  <dd className="text-sm text-muted-foreground">Dress code: {event.dressCode}</dd>
                )}
              </div>
            </dl>
          ) : (
            <EmptyState
              title="Celebration details are not set yet"
              description="The person who set up the website can help add the date and venue."
            />
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
        derivedPhase={currentPhase(new Date(), { ...config.phase, phaseOverride: null })}
        previewVars={{
          date: event ? formatEventDateTime(event.startsAt, zone) : 'the wedding date',
          rsvpBy: formatDate(config.phase.rsvpDeadline, zone),
        }}
      />
    </div>
  );
}
