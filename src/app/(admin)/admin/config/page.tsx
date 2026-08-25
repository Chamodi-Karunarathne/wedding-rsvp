import { currentPhase } from '@/lib/domain/phase';
import { toDateTimeLocalValue } from '@/lib/format';
import { getConfig } from '@/lib/services/config';
import { ConfigForm } from './config-form';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const config = await getConfig();
  const zone = config.site.timezone;

  return (
    <main>
      <h1 className="text-xl font-semibold">Config</h1>
      <p className="text-sm text-gray-600">
        Times are entered and shown in {zone}, the wedding&apos;s timezone - not yours.
      </p>

      <div className="mt-4">
        <ConfigForm
          phase={{
            detailsOpenAt: toDateTimeLocalValue(config.phase.detailsOpenAt, zone),
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
