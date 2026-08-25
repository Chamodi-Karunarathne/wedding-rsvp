'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EventView, RsvpView } from '@/lib/services/types';
import { postJson } from '../_components/api';

type Props = {
  guestId: string;
  displayName: string;
  maxPartySize: number;
  events: EventView[];
  invitedSlugs: string[];
  rsvps: RsvpView[];
};

/**
 * Records a response on a guest's behalf - someone phoned, or answered in
 * person. Goes through the same endpoint and the same invariants as a guest's
 * own submission; only source and recordedBy differ.
 */
export function ProxyRsvp({
  guestId,
  displayName,
  maxPartySize,
  events,
  invitedSlugs,
  rsvps,
}: Props) {
  const router = useRouter();
  const invited = events.filter((event) => invitedSlugs.includes(event.slug));

  const [fields, setFields] = useState(() =>
    Object.fromEntries(
      invited.map((event) => {
        const existing = rsvps.find((r) => r.eventSlug === event.slug);
        return [
          event.slug,
          {
            answered: existing !== undefined,
            attending: existing?.attending ?? true,
            partyCount: existing?.attending ? existing.partyCount : 1,
          },
        ];
      }),
    ),
  );
  const [recordedBy, setRecordedBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const responses = invited
      .filter((e) => fields[e.slug]?.answered)
      .map((e) => {
        const field = fields[e.slug]!;
        return {
          eventSlug: e.slug,
          attending: field.attending,
          partyCount: field.attending ? field.partyCount : 0,
        };
      });

    const result = await postJson('/api/admin/rsvp', {
      guestId,
      responses,
      recordedBy: recordedBy.trim(),
      source: 'phone',
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 border p-2 text-sm">
      <p className="font-medium">Record a response for {displayName}</p>

      {invited.map((event) => {
        const field = fields[event.slug]!;
        return (
          <div key={event.slug} className="border p-2">
            <label>
              <input
                type="checkbox"
                checked={field.answered}
                onChange={(e) =>
                  setFields((prev) => ({
                    ...prev,
                    [event.slug]: { ...prev[event.slug]!, answered: e.target.checked },
                  }))
                }
              />{' '}
              {event.name}
            </label>

            {field.answered && (
              <span className="ml-3">
                <select
                  value={field.attending ? 'yes' : 'no'}
                  onChange={(e) =>
                    setFields((prev) => ({
                      ...prev,
                      [event.slug]: {
                        ...prev[event.slug]!,
                        attending: e.target.value === 'yes',
                      },
                    }))
                  }
                  className="border px-1"
                >
                  <option value="yes">attending</option>
                  <option value="no">declined</option>
                </select>

                {field.attending && (
                  <input
                    type="number"
                    min={1}
                    max={maxPartySize}
                    value={field.partyCount}
                    onChange={(e) =>
                      setFields((prev) => ({
                        ...prev,
                        [event.slug]: {
                          ...prev[event.slug]!,
                          partyCount: Number(e.target.value),
                        },
                      }))
                    }
                    className="ml-2 w-16 border px-1"
                  />
                )}
              </span>
            )}
          </div>
        );
      })}

      <label className="block">
        Recorded by (your name - there is no per-person login)
        <input
          value={recordedBy}
          onChange={(e) => setRecordedBy(e.target.value)}
          className="w-full border px-2 py-1"
          required
        />
      </label>

      <button type="submit" disabled={busy} className="border px-3 py-1 disabled:opacity-50">
        {busy ? 'Saving...' : 'Save response'}
      </button>

      {saved && <span className="ml-2 text-green-700">Saved.</span>}
      {error && <p className="text-red-700">{error}</p>}
    </form>
  );
}
