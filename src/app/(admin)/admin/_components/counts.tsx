import type { EventCounts } from '@/lib/services/dashboard';
import { SummaryCard } from './ui';

export function CountsBlock({ counts, named }: { counts: EventCounts; named: boolean }) {
  return (
    <div className="space-y-3">
      {named && <h3 className="admin-section-title">{counts.event.name}</h3>}
      <div className="admin-counts grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          label="Guests attending"
          value={counts.headcount}
          hint="People confirmed so far"
          highlight
        />
        <SummaryCard
          label="Invited households"
          value={counts.invited}
          hint="One invitation per household"
        />
        <SummaryCard
          label="Households attending"
          value={counts.attending}
          hint="Have said they are coming"
        />
        <SummaryCard
          label="Waiting for reply"
          value={counts.noResponse}
          hint="Households still to answer"
        />
        <SummaryCard
          label="Unable to attend"
          value={counts.declined}
          hint="Households who declined"
        />
      </div>
    </div>
  );
}
