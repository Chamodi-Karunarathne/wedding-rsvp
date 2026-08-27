'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import type { GuestListRow } from '@/lib/services/guests';
import type { EventView } from '@/lib/services/types';
import { GuestEditor } from './guest-editor';

/** One table row, expanding into the editor. Client-side only so the list
 *  itself stays a plain server-rendered table. */
export function GuestRow({ row, events }: { row: GuestListRow; events: EventView[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow data-state={open ? 'selected' : undefined}>
        <TableCell className="font-medium wrap-break-word">
          {row.guest.displayName}
          {row.guest.displayNameFallback && (
            <span className="block text-xs font-normal text-muted-foreground">
              card: {row.guest.cardName}
            </span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{row.guest.side}</Badge>
        </TableCell>
        <TableCell className="tabular-nums">{row.guest.maxPartySize}</TableCell>
        <TableCell className="text-muted-foreground">
          {row.eventSlugs.join(', ') || '-'}
        </TableCell>
        <TableCell>
          {row.rsvps.length === 0 ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            row.rsvps
              .map((r) => `${r.eventSlug}: ${r.attending ? `yes (${r.partyCount})` : 'no'}`)
              .join('; ')
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {row.channels.map((c) => `${c.channel}:${c.status}`).join(', ') || '-'}
        </TableCell>
        <TableCell>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Edit'}
          </Button>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/40">
            <GuestEditor
              events={events}
              guest={row.guest}
              invitedSlugs={row.eventSlugs}
              onDone={() => setOpen(false)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
