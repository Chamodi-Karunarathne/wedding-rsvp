import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  const dates = [
    ['details open', config.phase.detailsOpenAt],
    ['reply by', config.phase.rsvpDeadline],
    ['day of', config.phase.dayOfStartAt],
    ['thank you', config.phase.thankYouAt],
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {summary.totalGuests} invitations, {summary.respondedGuests} with at least one response.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Phase
            <Badge variant={config.phase.phaseOverride ? 'destructive' : 'secondary'}>
              {phase}
            </Badge>
          </CardTitle>
          <CardDescription>
            {config.phase.phaseOverride
              ? 'Manually overridden. The site is ignoring the dates below until that is cleared.'
              : 'Derived from the dates below.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {dates.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">
                  {formatDateTimeShort(value, config.site.timezone)}
                </dd>
              </div>
            ))}
          </dl>
          <Link href="/admin/config" className={buttonVariants({ variant: 'outline' })}>
            Change dates
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Responses</h2>
          <p className="text-sm text-muted-foreground">
            Invited, attending and declined count invitations, not people. Headcount sums party
            sizes.
          </p>
        </div>
        {summary.perEvent.map((row) => (
          <CountsBlock key={row.event.slug} counts={row} named={summary.perEvent.length > 1} />
        ))}
      </section>
    </div>
  );
}
