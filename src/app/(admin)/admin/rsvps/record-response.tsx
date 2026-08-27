'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { EventView, RsvpView } from '@/lib/services/types';
import { postJson } from '../_components/api';

/**
 * Records a response on a guest's behalf.
 *
 * The printed cards tell their recipients to phone Masha or Shirani, so a
 * real fraction of the answers arrive as calls that someone has to key in
 * while the guest is still on the line. That is why this is search-first and
 * sits at the top of the page, rather than one form per guest buried under
 * five hundred others.
 *
 * It goes through the same endpoint, and therefore the same invariants, as a
 * guest's own submission. Only source and recordedBy differ.
 */

export type Candidate = {
  id: string;
  displayName: string;
  sortName: string;
  maxPartySize: number;
  invitedSlugs: string[];
  rsvps: RsvpView[];
};

type Props = { guests: Candidate[]; events: EventView[] };

type Field = { attending: boolean; partyCount: number; attendeeNames: string };

const MAX_RESULTS = 8;

function initialFields(guest: Candidate, invited: EventView[]): Record<string, Field> {
  return Object.fromEntries(
    invited.map((event) => {
      const existing = guest.rsvps.find((r) => r.eventSlug === event.slug);
      return [
        event.slug,
        {
          attending: existing?.attending ?? true,
          partyCount: existing?.attending ? existing.partyCount : 1,
          attendeeNames: existing?.attendeeNames ?? '',
        },
      ];
    }),
  );
}

function describe(rsvp: RsvpView): string {
  const answer = rsvp.attending ? `attending, party of ${rsvp.partyCount}` : 'declined';
  return `already ${answer}, via ${rsvp.source}`;
}

export function RecordResponse({ guests, events }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [fields, setFields] = useState<Record<string, Field>>({});
  const [recordedBy, setRecordedBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return [];
    return guests
      .filter(
        (guest) =>
          guest.displayName.toLowerCase().includes(needle) ||
          guest.sortName.toLowerCase().includes(needle),
      )
      .slice(0, MAX_RESULTS);
  }, [guests, query]);

  const invited = selected
    ? events.filter((event) => selected.invitedSlugs.includes(event.slug))
    : [];

  function choose(guest: Candidate) {
    const theirEvents = events.filter((event) => guest.invitedSlugs.includes(event.slug));
    setSelected(guest);
    setFields(initialFields(guest, theirEvents));
    setError(null);
    setSaved(null);
  }

  function cancel() {
    setSelected(null);
    setQuery('');
    setError(null);
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!selected) return;

    setBusy(true);
    setError(null);

    const responses = invited.map((event) => {
      const field = fields[event.slug]!;
      return {
        eventSlug: event.slug,
        attending: field.attending,
        partyCount: field.attending ? field.partyCount : 0,
        attendeeNames: field.attendeeNames.trim() || null,
      };
    });

    const result = await postJson('/api/admin/rsvp', {
      guestId: selected.id,
      responses,
      recordedBy: recordedBy.trim(),
      source: 'phone',
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    // recordedBy is deliberately kept: whoever is working through the
    // callbacks is about to record several in a row.
    setSaved(selected.displayName);
    setSelected(null);
    setQuery('');
    router.refresh();
  }

  return (
    <section className="border-2 p-3">
      <h2 className="font-medium">Record a response</h2>
      <p className="text-sm text-gray-600">
        For answers that arrive by telephone. Saved with source &ldquo;phone&rdquo; and your name,
        so they stay distinguishable from a guest&apos;s own answer later.
      </p>

      {saved && (
        <p className="mt-2 text-sm text-green-700">
          Saved {saved}. Search again for the next one.
        </p>
      )}

      {!selected && (
        <div className="mt-3">
          <label className="block text-sm">
            Search by name
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border px-2 py-1"
              placeholder="Start typing a name..."
              autoComplete="off"
            />
          </label>

          {query.trim() !== '' && matches.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">No guest matches that.</p>
          )}

          <ul className="mt-2 space-y-1 text-sm">
            {matches.map((guest) => {
              const existing = guest.rsvps[0];
              return (
                <li key={guest.id}>
                  <button type="button" onClick={() => choose(guest)} className="underline">
                    {guest.displayName}
                  </button>{' '}
                  <span className="text-gray-600">
                    (up to {guest.maxPartySize}) &mdash;{' '}
                    {existing ? describe(existing) : 'no response yet'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected && (
        <form onSubmit={submit} className="mt-3 space-y-2 text-sm">
          <p className="font-medium">{selected.displayName}</p>

          {selected.rsvps.length > 0 && (
            <p className="text-gray-600">
              This overwrites their current answer. The previous one is kept in the RSVP history.
            </p>
          )}

          {invited.length === 0 && (
            <p className="text-red-700">
              This guest holds no invitation, so there is nothing to answer for.
            </p>
          )}

          {invited.map((event) => {
            const field = fields[event.slug]!;
            const patch = (next: Partial<Field>) =>
              setFields((prev) => ({ ...prev, [event.slug]: { ...prev[event.slug]!, ...next } }));

            return (
              <div key={event.slug} className="border p-2">
                {events.length > 1 && <p className="font-medium">{event.name}</p>}

                <select
                  value={field.attending ? 'yes' : 'no'}
                  onChange={(e) => patch({ attending: e.target.value === 'yes' })}
                  className="border px-1 py-1"
                  aria-label="Answer"
                >
                  <option value="yes">attending</option>
                  <option value="no">declined</option>
                </select>

                {field.attending && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={selected.maxPartySize}
                      value={field.partyCount}
                      onChange={(e) => patch({ partyCount: Number(e.target.value) })}
                      className="ml-2 w-16 border px-1 py-1"
                      aria-label="Party count"
                    />
                    <input
                      value={field.attendeeNames}
                      onChange={(e) => patch({ attendeeNames: e.target.value })}
                      className="mt-2 w-full border px-2 py-1"
                      placeholder="Who is coming? (optional)"
                    />
                  </>
                )}
              </div>
            );
          })}

          <label className="block">
            Recorded by (your name &mdash; there is no per-person login)
            <input
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              className="w-full border px-2 py-1"
              required
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || invited.length === 0}
              className="border px-3 py-1 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save response'}
            </button>
            <button type="button" onClick={cancel} className="border px-3 py-1">
              Cancel
            </button>
          </div>

          {error && <p className="text-red-700">{error}</p>}
        </form>
      )}
    </section>
  );
}
