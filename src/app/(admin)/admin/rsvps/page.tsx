import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { DELIVERY_CHANNELS, RSVP_SOURCES, SIDES } from '@/db/schema';
import { applyFilters, getDashboardSummary } from '@/lib/services/dashboard';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import type { DeliveryChannelName, RsvpSource, Side } from '@/lib/services/types';
import { CountsBlock } from '../_components/counts';
import { RecordResponse, type Candidate } from './record-response';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ side?: string; channel?: string; source?: string }>;
};

function asSide(value: string | undefined): Side | 'all' {
  return value && (SIDES as readonly string[]).includes(value) ? (value as Side) : 'all';
}

function asChannel(value: string | undefined): DeliveryChannelName | 'all' {
  return value && (DELIVERY_CHANNELS as readonly string[]).includes(value)
    ? (value as DeliveryChannelName)
    : 'all';
}

function asSource(value: string | undefined): RsvpSource | 'all' {
  return value && (RSVP_SOURCES as readonly string[]).includes(value)
    ? (value as RsvpSource)
    : 'all';
}

export default async function AdminRsvpsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = {
    side: asSide(params.side),
    channel: asChannel(params.channel),
    source: asSource(params.source),
  };

  const [summary, allGuests, events] = await Promise.all([
    getDashboardSummary(filters),
    listGuests(),
    listEvents(),
  ]);

  const guests = applyFilters(allGuests, filters);

  const query = new URLSearchParams();
  if (filters.side !== 'all') query.set('side', filters.side);
  if (filters.channel !== 'all') query.set('channel', filters.channel);
  if (filters.source !== 'all') query.set('source', filters.source);

  /** A filter link that keeps the other two where they are. */
  function href(patch: Partial<typeof filters>): string {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch };
    if (merged.side !== 'all') next.set('side', merged.side);
    if (merged.channel !== 'all') next.set('channel', merged.channel);
    if (merged.source !== 'all') next.set('source', merged.source);
    return `/admin/rsvps?${next}`;
  }

  const filterGroups = [
    { label: 'Side', key: 'side' as const, options: ['all', ...SIDES] as const },
    { label: 'Channel', key: 'channel' as const, options: ['all', ...DELIVERY_CHANNELS] as const },
    { label: 'Source', key: 'source' as const, options: ['all', ...RSVP_SOURCES] as const },
  ];

  // Only what the search box and the form need. The full listing is far more
  // than this and all of it would cross to the client.
  const candidates: Candidate[] = allGuests.map((row) => ({
    id: row.guest.id,
    displayName: row.guest.displayName,
    sortName: row.guest.sortName,
    maxPartySize: row.guest.maxPartySize,
    invitedSlugs: row.eventSlugs,
    rsvps: row.rsvps,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">RSVPs</h1>
        <p className="text-sm text-muted-foreground">
          Answers arrive here from the site and over the telephone alike.
        </p>
      </div>

      <RecordResponse guests={candidates} events={events} />

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Where we stand</h2>
          <p className="text-sm text-muted-foreground">
            These counts follow the side and channel filters but never the source filter: an
            invitation with no answer has no source, so narrowing by it would understate every
            column.
          </p>
        </div>
        {summary.perEvent.map((row) => (
          <CountsBlock key={row.event.slug} counts={row} named={summary.perEvent.length > 1} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Narrows the list below and the CSV. Source never narrows the counts above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filterGroups.map((group) => (
            <div key={group.key} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-sm text-muted-foreground">{group.label}</span>
              {group.options.map((option) => (
                <Link
                  key={option}
                  href={href({ [group.key]: option } as Partial<typeof filters>)}
                  className={cn(
                    buttonVariants({
                      variant: option === filters[group.key] ? 'secondary' : 'ghost',
                      size: 'sm',
                    }),
                  )}
                >
                  {option}
                </Link>
              ))}
            </div>
          ))}

          <a
            href={`/api/admin/export/rsvps?${query}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Download filtered CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Responses{' '}
            <span className="text-muted-foreground">
              ({guests.length} {guests.length === 1 ? 'invitation' : 'invitations'} in filter)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Name', 'Side', 'Answer', 'Party', 'How it arrived', 'Recorded by'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((row) => {
                  const rsvp = row.rsvps[0];
                  return (
                    <TableRow key={row.guest.id}>
                      <TableCell className="font-medium">
                        <span className="admin-name">{row.guest.displayName}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.guest.side}</Badge>
                      </TableCell>
                      <TableCell>
                        {!rsvp ? (
                          <span className="text-muted-foreground">no response</span>
                        ) : rsvp.attending ? (
                          <Badge>attending</Badge>
                        ) : (
                          <Badge variant="secondary">declined</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {rsvp?.attending ? rsvp.partyCount : '-'}
                      </TableCell>
                      <TableCell>
                        {rsvp ? (
                          <Badge variant={rsvp.source === 'self' ? 'outline' : 'secondary'}>
                            {rsvp.source}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rsvp?.recordedBy ?? '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
