'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DISPLAY_NAME_SOFT_LIMIT,
  displayNameLength,
  isDisplayNameLong,
  resolveCardName,
} from '@/lib/domain/names';
import type { EventView, GuestView, Side } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { SIDE_LABELS } from '../_components/presentation';
import { Feedback } from '../_components/ui';

type Props = {
  events: EventView[];
  guest?: GuestView;
  invitedSlugs?: string[];
  onDone?: (message: string) => void;
};
export function GuestEditor({ events, guest, invitedSlugs = [], onDone }: Props) {
  const router = useRouter();
  const id = useId();
  const editing = guest !== undefined;
  const initialForm = {
    displayName: guest?.displayName ?? '',
    displayNameFallback: guest?.displayNameFallback ?? '',
    sortName: guest?.sortName ?? '',
    side: guest?.side ?? ('bride' as Side),
    maxPartySize: guest?.maxPartySize ?? 2,
    phone: guest?.phone ?? '',
    notes: guest?.notes ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const [slugs, setSlugs] = useState<string[]>(invitedSlugs);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  };
  const cardName = resolveCardName(form.displayName, form.displayNameFallback);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload = {
      displayName: form.displayName.trim(),
      displayNameFallback: form.displayNameFallback.trim() || null,
      sortName: form.sortName.trim() || form.displayName.trim(),
      side: form.side,
      maxPartySize: Number(form.maxPartySize),
      phone: form.phone.trim() || null,
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
    const message = editing ? 'Guest details updated.' : 'Guest added to your list.';
    if (!editing) {
      setForm({
        ...initialForm,
        displayName: '',
        displayNameFallback: '',
        sortName: '',
        side: 'bride',
        maxPartySize: 2,
        phone: '',
        notes: '',
      });
      setSlugs([]);
    }
    setSuccess(message);
    onDone?.(message);
    router.refresh();
  }
  async function remove() {
    if (
      !guest ||
      !window.confirm(
        'Remove “' +
          guest.displayName +
          '” from your guest list?\n\nTheir replies and sending records will also be removed, and their invitation link will stop working. This cannot be undone.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    const result = await postJson('/api/admin/guests', { id: guest.id }, 'DELETE');
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone?.('Guest removed.');
    router.refresh();
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <section className="admin-form-section">
          <h3>Guest details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={id + '-name'}>Guest or family name</Label>
              <Input
                id={id + '-name'}
                value={form.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="e.g. The Fernando Family"
                required
              />
              {isDisplayNameLong(form.displayName) && (
                <p className="text-sm text-muted-foreground">
                  This name has {displayNameLength(form.displayName)} characters. Over{' '}
                  {DISPLAY_NAME_SOFT_LIMIT} may feel crowded on the card. You can add a shorter card
                  name under More details.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + '-phone'}>Phone number</Label>
              <Input
                id={id + '-phone'}
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="e.g. 077 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + '-side'}>Family</Label>
              <select
                id={id + '-side'}
                className="admin-select"
                value={form.side}
                onChange={(e) => set('side', e.target.value as Side)}
              >
                {Object.entries(SIDE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + '-count'}>Places reserved</Label>
              <Input
                id={id + '-count'}
                aria-describedby={id + '-count-help'}
                type="number"
                min={1}
                max={50}
                step={1}
                required
                value={form.maxPartySize}
                onChange={(e) => set('maxPartySize', Number(e.target.value))}
              />
              <p id={id + '-count-help'} className="text-xs text-muted-foreground">
                The maximum number of people on this invitation. Guests can reduce this when
                replying.
              </p>
            </div>
          </div>
        </section>
        <section className="admin-form-section">
          <h3>Invitation</h3>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Invited to</legend>
            <div className="flex flex-wrap gap-3">
              {events.map((event) => (
                <Label key={event.slug} className="admin-choice font-normal">
                  <input
                    type="checkbox"
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
            {events.length === 0 && (
              <p className="text-muted-foreground">No celebration has been added yet.</p>
            )}
          </fieldset>
        </section>
        <details className="admin-disclosure">
          <summary>More details</summary>
          <div className="admin-disclosure-body grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={id + '-card-name'}>Shorter name on the invitation</Label>
              <Input
                id={id + '-card-name'}
                value={form.displayNameFallback}
                onChange={(e) => set('displayNameFallback', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The invitation will say: <strong>{cardName || 'Enter a guest name above'}</strong>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + '-sort'}>Name to sort by</Label>
              <Input
                id={id + '-sort'}
                value={form.sortName}
                onChange={(e) => set('sortName', e.target.value)}
                placeholder="Leave blank to use the guest name"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={id + '-private'}>Private family notes</Label>
              <Textarea
                id={id + '-private'}
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Only visible here. Your guest will not see these."
              />
            </div>
          </div>
        </details>
      </fieldset>
      <Feedback error={error} success={success} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : editing ? 'Save guest details' : 'Add guest'}
      </Button>
      {editing && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
            Remove this guest
          </summary>
          <p className="mb-3 text-muted-foreground">
            Removing this guest also removes their replies and disables their invitation link.
          </p>
          <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
            Remove guest
          </Button>
        </details>
      )}
    </form>
  );
}
