import Link from 'next/link';
import { DELIVERY_CHANNELS, SIDES } from '@/db/schema';
import { applyFilters, getDashboardSummary } from '@/lib/services/dashboard';
import { listEvents } from '@/lib/services/events';
import { listGuests } from '@/lib/services/guests';
import type { DeliveryChannelName, Side } from '@/lib/services/types';
import { CountsBlock } from '../_components/counts';
import { ProxyRsvp } from './proxy-rsvp';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ side?: string; channel?: string }> };

function asSide(value: string | undefined): Side | 'all' {
  return value && (SIDES as readonly string[]).includes(value) ? (value as Side) : 'all';
}

function asChannel(value: string | undefined): DeliveryChannelName | 'all' {
  return value && (DELIVERY_CHANNELS as readonly string[]).includes(value)
    ? (value as DeliveryChannelName)
    : 'all';
}

export default async function AdminRsvpsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = { side: asSide(params.side), channel: asChannel(params.channel) };

  const [summary, allGuests, events] = await Promise.all([
    getDashboardSummary(filters),
    listGuests(),
    listEvents(),
  ]);

  const guests = applyFilters(allGuests, filters);
  const query = new URLSearchParams();
  if (filters.side !== 'all') query.set('side', filters.side);
  if (filters.channel !== 'all') query.set('channel', filters.channel);

  return (
    <main>
      <h1 className="text-xl font-semibold">RSVPs</h1>

      <section className="mt-3 text-sm">
        <strong>Filter</strong>
        <div className="mt-1">
          side:{' '}
          {(['all', ...SIDES] as const).map((side) => (
            <Link
              key={side}
              href={`/admin/rsvps?${new URLSearchParams({
                ...(side !== 'all' && { side }),
                ...(filters.channel !== 'all' && { channel: filters.channel }),
              })}`}
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
              href={`/admin/rsvps?${new URLSearchParams({
                ...(filters.side !== 'all' && { side: filters.side }),
                ...(channel !== 'all' && { channel }),
              })}`}
              className={
                channel === filters.channel ? 'mr-2 font-bold underline' : 'mr-2 underline'
              }
            >
              {channel}
            </Link>
          ))}
        </div>
        <p className="mt-2">
          <a href={`/api/admin/export/rsvps?${query}`} className="underline">
            Download filtered CSV
          </a>
        </p>
      </section>

      <section className="mt-5">
        <h2 className="font-medium">Counts ({summary.totalGuests} invitations in filter)</h2>
        <div className="mt-2 space-y-4">
          {summary.perEvent.map((row) => (
            <CountsBlock key={row.event.slug} counts={row} named={summary.perEvent.length > 1} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Proxy entry</h2>
        <p className="text-sm text-gray-600">
          Recorded with source &ldquo;phone&rdquo; so these are distinguishable from a guest&apos;s
          own answer later.
        </p>
        <div className="mt-2 space-y-3">
          {guests.map((row) => (
            <ProxyRsvp
              key={row.guest.id}
              guestId={row.guest.id}
              displayName={row.guest.displayName}
              maxPartySize={row.guest.maxPartySize}
              events={events}
              invitedSlugs={row.eventSlugs}
              rsvps={row.rsvps}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
