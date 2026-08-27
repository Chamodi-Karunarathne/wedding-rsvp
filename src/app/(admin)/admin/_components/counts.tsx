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
  const figures: [string, number][] = [
    ['Invited', counts.invited],
    ['Attending', counts.attending],
    ['Declined', counts.declined],
    ['No response', counts.noResponse],
    ['Headcount', counts.headcount],
  ];

  return (
    <div>
      {named && <h3 className="font-medium">{counts.event.name}</h3>}
      <dl className="mt-1 flex flex-wrap gap-x-8 gap-y-2">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-gray-600">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
