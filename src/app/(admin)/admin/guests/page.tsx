import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { getConfig } from '@/lib/services/config';
import { filterAndSortGuests, parseTableFilters, tableHref, type TableSearchParams } from '@/lib/domain/admin-tables';
import { GuestRow } from './guest-row';
import { AddGuest, ImportGuests } from './guest-tools';
import { AdminPageHeader, EmptyState } from '../_components/ui';
import { SortableHead, TableControls } from '../_components/table-controls';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<TableSearchParams> };

export default async function AdminGuestsPage({ searchParams }: Props) {
  const [allGuests, events, config, params] = await Promise.all([
    listGuests(),
    listEvents(),
    getConfig(),
    searchParams,
  ]);
  const filters = parseTableFilters(params, events.map(event => event.slug), 'guests');
  const guests = filterAndSortGuests(allGuests, filters);
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Guests"
        description="Everyone on your wedding guest list. Each household has its own invitation."
        eyebrow={allGuests.length + ' households'}
      >
        <AddGuest events={events} />
        <ImportGuests events={events} />
        <a
          href={tableHref('/api/admin/export/guests', filters)}
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download guest list
        </a>
      </AdminPageHeader>
      <Card>
        <CardContent>
          <TableControls action="/admin/guests" view="guests" filters={filters} events={events} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {guests.length} of {allGuests.length} {allGuests.length === 1 ? 'household' : 'households'} shown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <EmptyState
              title={
                filters.q
                  ? 'No guests found for “' + filters.q + '”'
                  : allGuests.length === 0
                    ? 'Your guest list starts here'
                    : 'No guests match these filters'
              }
              description={
                allGuests.length === 0
                  ? 'Use Add guest or Import CSV to begin your list.'
                  : 'Try another name, phone number or filter.'
              }
            />
          ) : (
            <Table className="admin-table admin-guests">
              <TableHeader>
                <TableRow>
                  {([
                    ['Guest / Family', 'name'], ['Family', 'side'], ['Phone numbers', 'phone'],
                    ['Reserved', 'reserved'], ['Channels', 'channels'], ['Invitation', 'state'], ['Reply', 'response'],
                  ] as const).map(([label, column]) => <SortableHead key={column} label={label} column={column} action="/admin/guests" filters={filters} />)}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => (
                  <GuestRow
                    key={row.guest.id}
                    row={row}
                    displayEvent={filters.event}
                    events={events}
                    timezone={config.site.timezone}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
