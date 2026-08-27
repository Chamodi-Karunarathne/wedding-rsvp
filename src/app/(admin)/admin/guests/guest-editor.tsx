'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DISPLAY_NAME_SOFT_LIMIT,
  displayNameLength,
  isDisplayNameLong,
  resolveCardName,
} from '@/lib/domain/names';
import type { EventView, GuestView, Side } from '@/lib/services/types';
import { postJson } from '../_components/api';

type Props = {
  events: EventView[];
  /** Absent means "create". */
  guest?: GuestView;
  invitedSlugs?: string[];
  onDone?: () => void;
};

const SIDES: Side[] = ['bride', 'groom', 'both'];

export function GuestEditor({ events, guest, invitedSlugs = [], onDone }: Props) {
  const router = useRouter();
  const editing = guest !== undefined;

  const [form, setForm] = useState({
    displayName: guest?.displayName ?? '',
    displayNameFallback: guest?.displayNameFallback ?? '',
    sortName: guest?.sortName ?? '',
    side: guest?.side ?? ('bride' as Side),
    maxPartySize: guest?.maxPartySize ?? 2,
    phone: guest?.phone ?? '',
    personalNote: guest?.personalNote ?? '',
    notes: guest?.notes ?? '',
  });
  const [slugs, setSlugs] = useState<string[]>(invitedSlugs);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nameLength = displayNameLength(form.displayName);
  const tooLong = isDisplayNameLong(form.displayName);
  const cardName = resolveCardName(form.displayName, form.displayNameFallback);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      displayName: form.displayName.trim(),
      displayNameFallback: form.displayNameFallback.trim() || null,
      // Falls back to the display name so the field can be left blank.
      sortName: form.sortName.trim() || form.displayName.trim(),
      side: form.side,
      maxPartySize: Number(form.maxPartySize),
      phone: form.phone.trim() || null,
      personalNote: form.personalNote.trim() || null,
      notes: form.notes.trim() || null,
      eventSlugs: slugs,
    };

    const result = editing
      ? await postJson('/api/admin/guests', { id: guest.id, ...payload }, 'PATCH')
      : await postJson('/api/admin/guests', payload);

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (!editing) {
      setForm({
        displayName: '',
        displayNameFallback: '',
        sortName: '',
        side: 'bride',
        maxPartySize: 2,
        phone: '',
        personalNote: '',
        notes: '',
      });
      setSlugs([]);
    }
    onDone?.();
    router.refresh();
  }

  async function remove() {
    if (!guest) return;
    const confirmed = window.confirm(
      `Delete "${guest.displayName}"?\n\n` +
        `This also deletes their responses and delivery records. If their invitation link ` +
        `has already been sent, that link will stop working.`,
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await postJson('/api/admin/guests', { id: guest.id }, 'DELETE');
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name (exactly as addressed)</Label>
          <Input
            id="displayName"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            required
          />
          {/*
            A warning, never a block. The card is a fixed width in a display
            serif, so a long name breaks the layout - but whether "The
            Fernando Family" is acceptable is the family's call, not ours.
          */}
          {tooLong && (
            <p className="text-sm text-destructive">
              {nameLength} characters. Over {DISPLAY_NAME_SOFT_LIMIT} is likely to break the card
              layout &mdash; consider a shorter form beside this. Saving anyway is fine.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayNameFallback">Shorter name for the card</Label>
          <Input
            id="displayNameFallback"
            value={form.displayNameFallback}
            onChange={(e) => set('displayNameFallback', e.target.value)}
            placeholder="e.g. The Fernando Family"
          />
          <p className="text-sm text-muted-foreground">
            Blank uses the display name. The card will read:{' '}
            <strong className="text-foreground">{cardName || '(nothing yet)'}</strong>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sortName">Sort name</Label>
          <Input
            id="sortName"
            value={form.sortName}
            onChange={(e) => set('sortName', e.target.value)}
            placeholder="Blank uses the display name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="side">Side</Label>
          <Select value={form.side} onValueChange={(value) => set('side', value as Side)}>
            <SelectTrigger id="side" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIDES.map((side) => (
                <SelectItem key={side} value={side}>
                  {side}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxPartySize">Max party size</Label>
          <Input
            id="maxPartySize"
            type="number"
            min={1}
            max={50}
            value={form.maxPartySize}
            onChange={(e) => set('maxPartySize', Number(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Admin only - never shown to the guest"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="personalNote">Personal note (shown only to this guest)</Label>
        <Textarea
          id="personalNote"
          rows={2}
          value={form.personalNote}
          onChange={(e) => set('personalNote', e.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Invited to</legend>
        <div className="flex flex-wrap gap-4">
          {events.map((event) => (
            <Label key={event.slug} className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={slugs.includes(event.slug)}
                onChange={(e) =>
                  setSlugs((prev) =>
                    e.target.checked
                      ? [...prev, event.slug]
                      : prev.filter((slug) => slug !== event.slug),
                  )
                }
              />
              {event.name}
            </Label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Create guest'}
        </Button>
        {editing && (
          <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
            Delete
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
