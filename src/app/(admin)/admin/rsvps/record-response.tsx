'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Record a response</CardTitle>
        <CardDescription>
          For answers that arrive by telephone. Saved with source &ldquo;phone&rdquo; and your
          name, so they stay distinguishable from a guest&apos;s own answer later.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {saved && (
          <Alert>
            <AlertDescription>Saved {saved}. Search again for the next one.</AlertDescription>
          </Alert>
        )}

        {!selected && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="guest-search">Search by name</Label>
              <Input
                id="guest-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing a name..."
                autoComplete="off"
              />
            </div>

            {query.trim() !== '' && matches.length === 0 && (
              <p className="text-sm text-muted-foreground">No guest matches that.</p>
            )}

            {matches.length > 0 && (
              <ul className="divide-y rounded-xl border">
                {matches.map((guest) => {
                  const existing = guest.rsvps[0];
                  return (
                    <li key={guest.id}>
                      <button
                        type="button"
                        onClick={() => choose(guest)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{guest.displayName}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          up to {guest.maxPartySize}
                          <Badge variant={existing ? 'secondary' : 'outline'}>
                            {existing ? describe(existing) : 'no response yet'}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {selected && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="font-medium">{selected.displayName}</p>
              {selected.rsvps.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  This overwrites their current answer. The previous one is kept in the RSVP
                  history.
                </p>
              )}
            </div>

            {invited.length === 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  This guest holds no invitation, so there is nothing to answer for.
                </AlertDescription>
              </Alert>
            )}

            {invited.map((event) => {
              const field = fields[event.slug]!;
              const patch = (next: Partial<Field>) =>
                setFields((prev) => ({ ...prev, [event.slug]: { ...prev[event.slug]!, ...next } }));

              return (
                <div key={event.slug} className="space-y-3 rounded-xl border p-3">
                  {events.length > 1 && <p className="font-medium">{event.name}</p>}

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`answer-${event.slug}`}>Answer</Label>
                      <Select
                        value={field.attending ? 'yes' : 'no'}
                        onValueChange={(value) => patch({ attending: value === 'yes' })}
                      >
                        <SelectTrigger id={`answer-${event.slug}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">attending</SelectItem>
                          <SelectItem value="no">declined</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {field.attending && (
                      <div className="space-y-2">
                        <Label htmlFor={`party-${event.slug}`}>Party count</Label>
                        <Input
                          id={`party-${event.slug}`}
                          type="number"
                          min={1}
                          max={selected.maxPartySize}
                          value={field.partyCount}
                          onChange={(e) => patch({ partyCount: Number(e.target.value) })}
                          className="w-24"
                        />
                      </div>
                    )}
                  </div>

                  {field.attending && (
                    <div className="space-y-2">
                      <Label htmlFor={`names-${event.slug}`}>Who is coming?</Label>
                      <Input
                        id={`names-${event.slug}`}
                        value={field.attendeeNames}
                        onChange={(e) => patch({ attendeeNames: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="space-y-2">
              <Label htmlFor="recorded-by">Recorded by</Label>
              <Input
                id="recorded-by"
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
                placeholder="Your name - there is no per-person login"
                required
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || invited.length === 0}>
                {busy ? 'Saving...' : 'Save response'}
              </Button>
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
