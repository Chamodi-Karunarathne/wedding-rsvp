'use client';

import { useState } from 'react';
import type { GuestListRow } from '@/lib/services/guests';
import type { EventView } from '@/lib/services/types';
import { GuestEditor } from './guest-editor';

/** One table row, expanding into the editor. Client-side only so the list
 *  itself stays a plain server-rendered table. */
export function GuestRow({ row, events }: { row: GuestListRow; events: EventView[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr>
        <td className="border px-2 py-1 break-words">{row.guest.displayName}</td>
        <td className="border px-2 py-1">{row.guest.side}</td>
        <td className="border px-2 py-1">{row.guest.maxPartySize}</td>
        <td className="border px-2 py-1">{row.eventSlugs.join(', ') || '-'}</td>
        <td className="border px-2 py-1">
          {row.rsvps.length === 0
            ? '-'
            : row.rsvps
                .map((r) => `${r.eventSlug}: ${r.attending ? `yes (${r.partyCount})` : 'no'}`)
                .join('; ')}
        </td>
        <td className="border px-2 py-1">
          {row.channels.map((c) => `${c.channel}:${c.status}`).join(', ') || '-'}
        </td>
        <td className="border px-2 py-1">
          <button type="button" onClick={() => setOpen((v) => !v)} className="underline">
            {open ? 'close' : 'edit'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="border px-2 py-2">
            <GuestEditor
              events={events}
              guest={row.guest}
              invitedSlugs={row.eventSlugs}
              onDone={() => setOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
