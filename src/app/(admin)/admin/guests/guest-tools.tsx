'use client';

import dynamic from 'next/dynamic';
import type { EventView } from '@/lib/services/types';
import { WorkflowDialog } from '../_components/workflow-dialog';

const GuestEditor = dynamic(() => import('./guest-editor').then(module => module.GuestEditor), {
  loading: () => <p role="status">Loading guest details…</p>,
});
const CsvImport = dynamic(() => import('./csv-import').then(module => module.CsvImport), {
  loading: () => <p role="status">Loading guest import…</p>,
});

/** Defer optional forms until opened; keep them mounted to preserve drafts. */
export function AddGuest({ events }: { events: EventView[] }) {
  return (
    <WorkflowDialog title="Add a guest or family" label="Add guest" description="Create a household, choose its celebrations and sending channels.">
      <GuestEditor events={events} />
    </WorkflowDialog>
  );
}

export function ImportGuests({ events }: { events: EventView[] }) {
  return (
    <WorkflowDialog title="Import a guest list" label="Import CSV" description="Upload a CSV, review duplicate households and choose what to save." wide>
      <CsvImport events={events} />
    </WorkflowDialog>
  );
}
