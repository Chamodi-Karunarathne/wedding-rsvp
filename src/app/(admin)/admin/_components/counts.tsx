import { Card, CardContent } from '@/components/ui/card';
import type { EventCounts } from '@/lib/services/dashboard';

/**
 * One set of counts.
 *
 * Deliberately not a per-event table: there is a single event, and a table
 * with one data row invites the reader to look for the others. Rendered once
 * per event, so a second event added later simply appears below this one,
 * with its name back to tell them apart.
 */
export function CountsBlock({ counts, named }: { counts: EventCounts; named: boolean }) {
  const figures: { label: string; value: number; hint?: string }[] = [
    { label: 'Invited', value: counts.invited },
    { label: 'Attending', value: counts.attending },
    { label: 'Declined', value: counts.declined },
    { label: 'No response', value: counts.noResponse },
    { label: 'Final headcount', value: counts.headcount, hint: 'people confirmed attending' },
  ];

  return (
    <div className="space-y-2">
      {named && <h3 className="font-heading font-medium">{counts.event.name}</h3>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {figures.map((figure) => (
          <Card key={figure.label}>
            <CardContent className="p-4">
              <dl>
                <dt className="text-sm text-muted-foreground">{figure.label}</dt>
                <dd className="font-heading mt-1 text-3xl font-semibold tabular-nums">
                  {figure.value}
                </dd>
                {figure.hint && (
                  <dd className="mt-1 text-xs text-muted-foreground">{figure.hint}</dd>
                )}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
