'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RiPhoneLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EventView, RsvpView } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { SOURCE_LABELS } from '../_components/presentation';
import { Feedback } from '../_components/ui';

export type Candidate = {
  id: string;
  displayName: string;
  sortName: string;
  phone: string | null;
  maxPartySize: number;
  invitedSlugs: string[];
  rsvps: RsvpView[];
};
type Field = { attending: boolean; partyCount: number; attendeeNames: string };
function initialFields(guest: Candidate, invited: EventView[]): Record<string, Field> {
  return Object.fromEntries(
    invited.map((event) => {
      const existing = guest.rsvps.find((reply) => reply.eventSlug === event.slug);
      return [
        event.slug,
        {
          attending: existing?.attending ?? true,
          partyCount: existing?.attending
            ? Math.min(existing.partyCount, guest.maxPartySize)
            : guest.maxPartySize,
          attendeeNames: existing?.attendeeNames ?? '',
        },
      ];
    }),
  );
}

export function RecordResponse({
  guests,
  events,
  initialGuestId,
}: {
  guests: Candidate[];
  events: EventView[];
  initialGuestId?: string;
}) {
  const router = useRouter();
  const initialGuest = guests.find((guest) => guest.id === initialGuestId) ?? null;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(initialGuest);
  const [fields, setFields] = useState<Record<string, Field>>(() =>
    initialGuest
      ? initialFields(
          initialGuest,
          events.filter((event) => initialGuest.invitedSlugs.includes(event.slug)),
        )
      : {},
  );
  const [recordedBy, setRecordedBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle
      ? []
      : guests
          .filter((guest) =>
            [guest.displayName, guest.sortName, guest.phone ?? ''].some((value) =>
              value.toLocaleLowerCase().includes(needle),
            ),
          )
          .slice(0, 8);
  }, [guests, query]);
  const invited = selected
    ? events.filter((event) => selected.invitedSlugs.includes(event.slug))
    : [];
  function choose(guest: Candidate) {
    setSelected(guest);
    setFields(
      initialFields(
        guest,
        events.filter((event) => guest.invitedSlugs.includes(event.slug)),
      ),
    );
    setError(null);
    setSaved(null);
  }
  function cancel() {
    setSelected(null);
    setQuery('');
    setError(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
    setSaved(selected.displayName);
    setSelected(null);
    setQuery('');
    requestAnimationFrame(() =>
      document.getElementById('record-reply')?.scrollIntoView({ block: 'start' }),
    );
    router.refresh();
  }
  return (
    <Card id="record-reply" className="scroll-mt-28 !border-[#d9cdae]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RiPhoneLine size={19} className="text-primary" aria-hidden="true" />
          Record a phone reply
        </CardTitle>
        <CardDescription>
          For an answer received by phone. Find the family, record their reply, then save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Feedback
          success={
            saved ? 'Response saved for ' + saved + '. Ready to record another reply.' : null
          }
        />
        {!selected && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone-guest-search">
                <span className="admin-step" aria-hidden="true">
                  1
                </span>
                Find the guest or family
              </Label>
              <Input
                id="phone-guest-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone number"
                autoComplete="off"
                type="search"
              />
            </div>
            {query.trim() && matches.length === 0 && (
              <p role="status" className="text-muted-foreground">
                No guests found for “{query}”. Try another name or phone number.
              </p>
            )}
            {matches.length > 0 && (
              <ul className="divide-y rounded-xl border border-border">
                {matches.map((guest) => (
                  <li key={guest.id}>
                    <button
                      type="button"
                      onClick={() => choose(guest)}
                      className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <strong className="block font-medium">{guest.displayName}</strong>
                        {guest.phone && <span className="admin-row-subtext">{guest.phone}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {guest.maxPartySize} places reserved
                        {guest.rsvps.length > 0 && (
                          <span className="block">Reply already recorded</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {selected && (
          <form onSubmit={submit} className="space-y-5">
            <div className="admin-phone-selected flex items-start justify-between gap-3 rounded-xl bg-muted p-4">
              <div className="min-w-0 break-words">
                <p className="font-semibold">{selected.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {selected.maxPartySize} places reserved
                  {selected.phone ? ' · ' + selected.phone : ''}
                </p>
                {selected.rsvps.map((reply) => (
                  <p key={reply.eventSlug} className="mt-1 text-xs text-muted-foreground">
                    Current reply
                    {events.length > 1
                      ? ' for ' + events.find((event) => event.slug === reply.eventSlug)?.name
                      : ''}
                    :{' '}
                    {reply.attending
                      ? 'Coming · ' + reply.partyCount + ' guests'
                      : 'Unable to attend'}{' '}
                    · {SOURCE_LABELS[reply.source]}
                  </p>
                ))}
              </div>
              <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
                Change guest
              </Button>
            </div>
            {selected.rsvps.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Saving will update their current reply. The previous answer will be kept.
              </p>
            )}
            {invited.length === 0 && (
              <p role="alert" className="admin-error">
                This guest is not assigned to a celebration yet.{' '}
                <Link
                  className="underline"
                  href={'/admin/guests?q=' + encodeURIComponent(selected.displayName)}
                >
                  Update their invitation
                </Link>{' '}
                first.
              </p>
            )}
            <fieldset disabled={busy} className="space-y-5">
              {invited.map((event) => {
                const field = fields[event.slug]!;
                const patch = (next: Partial<Field>) =>
                  setFields((prev) => ({
                    ...prev,
                    [event.slug]: { ...prev[event.slug]!, ...next },
                  }));
                return (
                  <fieldset
                    key={event.slug}
                    className="space-y-4 rounded-xl border border-border p-4"
                  >
                    <legend className="px-1 font-medium">
                      <span className="admin-step" aria-hidden="true">
                        2
                      </span>
                      {events.length > 1 ? event.name : 'Their reply'}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Label className="admin-choice">
                        <input
                          type="radio"
                          name={'answer-' + event.slug}
                          checked={field.attending}
                          onChange={() => patch({ attending: true })}
                        />
                        Coming
                      </Label>
                      <Label className="admin-choice">
                        <input
                          type="radio"
                          name={'answer-' + event.slug}
                          checked={!field.attending}
                          onChange={() => patch({ attending: false })}
                        />
                        Unable to attend
                      </Label>
                    </div>
                    {field.attending && (
                      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
                        <div className="space-y-2">
                          <Label htmlFor={'party-' + event.slug}>Number attending</Label>
                          <Input
                            id={'party-' + event.slug}
                            type="number"
                            min={1}
                            max={selected.maxPartySize}
                            step={1}
                            required
                            value={field.partyCount}
                            onChange={(e) => patch({ partyCount: Number(e.target.value) })}
                          />
                          <p className="text-xs text-muted-foreground">
                            Up to {selected.maxPartySize}{' '}
                            {selected.maxPartySize === 1 ? 'person' : 'people'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={'names-' + event.slug}>Names of people attending</Label>
                          <Input
                            id={'names-' + event.slug}
                            value={field.attendeeNames}
                            onChange={(e) => patch({ attendeeNames: e.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    )}
                  </fieldset>
                );
              })}
              <div className="space-y-2">
                <Label htmlFor="recorded-by">
                  <span className="admin-step" aria-hidden="true">
                    3
                  </span>
                  Your name
                </Label>
                <Input
                  id="recorded-by"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  placeholder="Who is recording this reply?"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Helps the family know who took the call.
                </p>
              </div>
            </fieldset>
            <Feedback error={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || invited.length === 0}>
                {busy ? 'Saving reply…' : 'Save response'}
              </Button>
              <Button type="button" variant="outline" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
