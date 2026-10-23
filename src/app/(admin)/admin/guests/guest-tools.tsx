'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { EventView } from '@/lib/services/types';

const GuestEditor = dynamic(() => import('./guest-editor').then(module => module.GuestEditor), {
  loading: () => <p role="status">Loading guest details…</p>,
});
const CsvImport = dynamic(() => import('./csv-import').then(module => module.CsvImport), {
  loading: () => <p role="status">Loading guest import…</p>,
});

/** Defer optional forms until opened; keep them mounted to preserve drafts. */
export function AddGuest({ events }: { events: EventView[] }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      className="admin-disclosure"
      id="add-guest"
      data-admin-editing
      onToggle={event => { if (event.currentTarget.open) setLoaded(true); }}
    >
      <summary>Add a guest or family</summary>
      <div className="admin-disclosure-body">
        {loaded && <GuestEditor events={events} />}
      </div>
    </details>
  );
}

export function ImportGuests({ events }: { events: EventView[] }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      className="admin-disclosure"
      data-admin-editing
      onToggle={event => { if (event.currentTarget.open) setLoaded(true); }}
    >
      <summary>Import a guest list</summary>
      <div className="admin-disclosure-body space-y-4">
        <p className="text-muted-foreground">
          Have a list in Excel? Save it as a CSV file, then check it here before adding guests.
        </p>
        {loaded && <CsvImport events={events} />}
      </div>
    </details>
  );
}
