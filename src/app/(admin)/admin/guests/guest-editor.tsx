'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      displayName: form.displayName.trim(),
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
    <form onSubmit={save} className="space-y-2 border p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          Display name (exactly as addressed)
          <input
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            className="w-full border px-2 py-1"
            required
          />
        </label>
        <label className="block">
          Sort name (blank = display name)
          <input
            value={form.sortName}
            onChange={(e) => set('sortName', e.target.value)}
            className="w-full border px-2 py-1"
          />
        </label>
        <label className="block">
          Side
          <select
            value={form.side}
            onChange={(e) => set('side', e.target.value as Side)}
            className="w-full border px-2 py-1"
          >
            {SIDES.map((side) => (
              <option key={side} value={side}>
                {side}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Max party size
          <input
            type="number"
            min={1}
            max={50}
            value={form.maxPartySize}
            onChange={(e) => set('maxPartySize', Number(e.target.value))}
            className="w-full border px-2 py-1"
          />
        </label>
        <label className="block">
          Phone
          <input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className="w-full border px-2 py-1"
          />
        </label>
        <label className="block">
          Notes (admin only - never shown to the guest)
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full border px-2 py-1"
          />
        </label>
      </div>

      <label className="block">
        Personal note (shown only to this guest)
        <textarea
          rows={2}
          value={form.personalNote}
          onChange={(e) => set('personalNote', e.target.value)}
          className="w-full border px-2 py-1"
        />
      </label>

      <fieldset className="border p-2">
        <legend>Invited to</legend>
        {events.map((event) => (
          <label key={event.slug} className="mr-4">
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
            />{' '}
            {event.name}
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="border px-3 py-1 disabled:opacity-50">
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Create guest'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="border px-3 py-1 text-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>

      {error && <p className="text-red-700">{error}</p>}
    </form>
  );
}
