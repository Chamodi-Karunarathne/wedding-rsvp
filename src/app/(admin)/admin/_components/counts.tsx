import type { EventCounts } from '@/lib/services/dashboard';
import { SummaryCard } from './ui';

export function CountsBlock({ counts, named }: { counts: EventCounts; named: boolean }) {
  return (
    <div className="space-y-3">
      {named && <h3 className="admin-section-title">{counts.event.name}</h3>}
      <div className="admin-counts grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Guests invited"
          value={counts.invitedGuests}
          hint={`${counts.invited} ${counts.invited === 1 ? 'household' : 'households'} · Reserved places`}
        />
        <SummaryCard
          label="Guests attending"
          value={counts.headcount}
          hint={`${counts.attending} ${counts.attending === 1 ? 'household' : 'households'} · Confirmed guests`}
          highlight
        />
        <SummaryCard
          label="Waiting for reply"
          value={counts.waitingGuests}
          hint={`${counts.noResponse} ${counts.noResponse === 1 ? 'household' : 'households'} · Reserved places`}
        />
        <SummaryCard
          label="Unable to attend"
          value={counts.declinedGuests}
          hint={`${counts.declined} ${counts.declined === 1 ? 'household' : 'households'} · Reserved places declined`}
        />
      </div>
      <p className="text-xs text-muted-foreground">Invited, waiting and declined figures use reserved places. Attending uses the number confirmed in replies.</p>
    </div>
  );
}
