import Link from 'next/link';
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
    <main>
      <h1 className="text-xl font-semibold">RSVPs</h1>

      <div className="mt-3">
        <RecordResponse guests={candidates} events={events} />
      </div>

      <section className="mt-6">
        <h2 className="font-medium">Where we stand</h2>
        <div className="mt-2 space-y-4">
          {summary.perEvent.map((row) => (
            <CountsBlock key={row.event.slug} counts={row} named={summary.perEvent.length > 1} />
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Invited, attending and declined count invitations, not people. Headcount sums party
          sizes &mdash; that is the catering number. These counts follow the side and channel
          filters but never the source filter: an invitation with no answer has no source, so
          narrowing by it would understate every column.
        </p>
      </section>

      <section className="mt-6 text-sm">
        <strong>Filter</strong>
        <div className="mt-1">
          side:{' '}
          {(['all', ...SIDES] as const).map((side) => (
            <Link
              key={side}
              href={href({ side })}
              className={side === filters.side ? 'mr-2 font-bold underline' : 'mr-2 underline'}
            >
              {side}
            </Link>
          ))}
        </div>
        <div className="mt-1">
          channel:{' '}
          {(['all', ...DELIVERY_CHANNELS] as const).map((channel) => (
            <Link
              key={channel}
              href={href({ channel })}
              className={
                channel === filters.channel ? 'mr-2 font-bold underline' : 'mr-2 underline'
              }
            >
              {channel}
            </Link>
          ))}
        </div>
        <div className="mt-1">
          source:{' '}
          {(['all', ...RSVP_SOURCES] as const).map((source) => (
            <Link
              key={source}
              href={href({ source })}
              className={source === filters.source ? 'mr-2 font-bold underline' : 'mr-2 underline'}
            >
              {source}
            </Link>
          ))}
        </div>
        <p className="mt-2">
          <a href={`/api/admin/export/rsvps?${query}`} className="underline">
            Download filtered CSV
          </a>
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">
          Responses ({guests.length} {guests.length === 1 ? 'invitation' : 'invitations'} in filter)
        </h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Name', 'Side', 'Answer', 'Party', 'How it arrived', 'Recorded by'].map((h) => (
                <th key={h} className="border px-2 py-1 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guests.map((row) => {
              const rsvp = row.rsvps[0];
              return (
                <tr key={row.guest.id}>
                  <td className="border px-2 py-1 wrap-break-word">{row.guest.displayName}</td>
                  <td className="border px-2 py-1">{row.guest.side}</td>
                  <td className="border px-2 py-1">
                    {!rsvp ? (
                      <span className="text-gray-500">no response</span>
                    ) : rsvp.attending ? (
                      'attending'
                    ) : (
                      'declined'
                    )}
                  </td>
                  <td className="border px-2 py-1">{rsvp?.attending ? rsvp.partyCount : '-'}</td>
                  <td className="border px-2 py-1">{rsvp?.source ?? '-'}</td>
                  <td className="border px-2 py-1">{rsvp?.recordedBy ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
