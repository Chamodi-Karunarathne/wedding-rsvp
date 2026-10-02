import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import { CsvImport } from './csv-import';
import { GuestRow } from './guest-row';
import { GuestEditor } from './guest-editor';

export const dynamic = 'force-dynamic';

const COLUMNS = ['Name', 'Side', 'Assigned headcount', 'Events', 'Responses', 'Channels', ''];

export default async function AdminGuestsPage() {
  const [guests, events] = await Promise.all([listGuests(), listEvents()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Guests</h1>
        <p className="text-sm text-muted-foreground">
          {guests.length} invitations. One row per invitation &mdash; never one per person, never
          one per delivery channel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a guest</CardTitle>
        </CardHeader>
        <CardContent>
          <GuestEditor events={events} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import CSV</CardTitle>
          <CardDescription>
            Preview first. Re-importing the same file updates rather than duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport events={events} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All guests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column, index) => (
                    <TableHead key={column === '' ? `actions-${index}` : column}>
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => (
                  <GuestRow key={row.guest.id} row={row} events={events} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
