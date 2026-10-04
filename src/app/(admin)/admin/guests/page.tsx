import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { getConfig } from '@/lib/services/config';
import { CsvImport } from './csv-import';
import { GuestRow } from './guest-row';
import { GuestEditor } from './guest-editor';
import { AdminPageHeader, EmptyState, SearchFilters } from '../_components/ui';
import { matchesReply, matchesSearch, SIDE_LABELS } from '../_components/presentation';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ q?: string; status?: string; side?: string }> };

export default async function AdminGuestsPage({ searchParams }: Props) {
  const [allGuests, events, config, params] = await Promise.all([
    listGuests(),
    listEvents(),
    getConfig(),
    searchParams,
  ]);
  const query = params.q ?? '';
  const status = params.status ?? 'all';
  const side = params.side ?? 'all';
  const guests = allGuests.filter(
    (row) =>
      matchesSearch(row, query) &&
      matchesReply(row, status) &&
      (side === 'all' || row.guest.side === side),
  );
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Guests"
        description="Everyone on your wedding guest list. Each household has its own invitation."
        eyebrow={allGuests.length + ' households'}
      >
        <a
          href="/api/admin/export/rsvps"
          className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
        >
          Download guest list
        </a>
      </AdminPageHeader>
      <details className="admin-disclosure" id="add-guest">
        <summary>Add a guest or family</summary>
        <div className="admin-disclosure-body">
          <GuestEditor events={events} />
        </div>
      </details>
      <Card>
        <CardContent>
          <SearchFilters
            key={query + status + side}
            action="/admin/guests"
            query={query}
            filters={[
              {
                name: 'status',
                label: 'Show',
                value: status,
                options: [
                  { value: 'all', label: 'All guests' },
                  { value: 'not_sent', label: 'Invitation not sent' },
                  { value: 'waiting', label: 'Waiting for reply' },
                  { value: 'coming', label: 'Coming' },
                  { value: 'declined', label: 'Unable to attend' },
                ],
              },
              {
                name: 'side',
                label: 'Family',
                value: side,
                options: [
                  { value: 'all', label: 'Both sides' },
                  ...Object.entries(SIDE_LABELS).map(([value, label]) => ({ value, label })),
                ],
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {guests.length} {guests.length === 1 ? 'household' : 'households'}
            {query || status !== 'all' || side !== 'all' ? ' found' : ' on the list'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <EmptyState
              title={
                query
                  ? 'No guests found for “' + query + '”'
                  : allGuests.length === 0
                    ? 'Your guest list starts here'
                    : 'No guests match these filters'
              }
              description={
                allGuests.length === 0
                  ? 'Add a guest above, or import your family’s list below.'
                  : 'Try another name, phone number or filter.'
              }
            />
          ) : (
            <Table className="admin-table">
              <TableHeader>
                <TableRow>
                  {['Guest / Family', 'Invitation', 'Response', ''].map((heading) => (
                    <TableHead key={heading}>{heading}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => (
                  <GuestRow
                    key={row.guest.id}
                    row={row}
                    events={events}
                    timezone={config.site.timezone}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <details className="admin-disclosure">
        <summary>Import a guest list</summary>
        <div className="admin-disclosure-body space-y-4">
          <p className="text-muted-foreground">
            Have a list in Excel? Save it as a CSV file, then check it here before adding guests.
          </p>
          <CsvImport events={events} />
        </div>
      </details>
    </div>
  );
}
