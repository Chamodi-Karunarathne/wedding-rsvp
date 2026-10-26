'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimeShort } from '@/lib/format';
import type { GuestListRow } from '@/lib/services/guests';
import type { EventView } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { Feedback, StatusBadge } from '../_components/ui';
import { PhoneNumbers } from '../_components/phone-numbers';
import { CHANNEL_LABELS, INVITATION_LABELS, invitationStatus, needsWhatsAppPhone, SIDE_LABELS, SOURCE_LABELS } from '../_components/presentation';

const GuestEditor = dynamic(() => import('./guest-editor').then(module => module.GuestEditor), {
  loading: () => <p role="status">Loading guest details…</p>,
});

export function GuestRow({ row, events, timezone }: { row: GuestListRow; events: EventView[]; timezone: string }) {
  const router = useRouter();
  const deleteInFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);
  async function removeGuest() {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    const result = await postJson('/api/admin/guests', { id: row.guest.id }, 'DELETE');
    deleteInFlight.current = false;
    setDeleting(false);
    if (!result.ok) { setDeleteError(result.message); return; }
    const deleted = result.data.deleted;
    if (!deleted || typeof deleted !== 'object' || !('id' in deleted) || deleted.id !== row.guest.id) {
      setDeleteError('The website did not confirm this deletion. Refresh the page to check before trying again.');
      return;
    }
    setOpen(false);
    setRemoved(true);
    router.refresh();
  }
  if (removed) return null;
  const state = invitationStatus(row);
  const invited = events.filter(event => row.eventSlugs.includes(event.slug));
  return (
    <Dialog open={open} onOpenChange={value => { if (!deleting) { setOpen(value); if (value) setLoaded(true); else setConfirmDelete(false); } }}>
      <TableRow>
        <TableCell><span className="admin-name" title={row.guest.displayName}>{row.guest.displayName}</span></TableCell>
        <TableCell>{SIDE_LABELS[row.guest.side]}</TableCell>
        <TableCell><PhoneNumbers value={row.guest.phone} /></TableCell>
        <TableCell><span className="tabular-nums">{row.guest.maxPartySize}</span></TableCell>
        <TableCell>
          <div className="admin-cell-badges">{row.channels.length ? row.channels.map(channel => <span key={channel.channel} className="admin-channel-tag">{CHANNEL_LABELS[channel.channel]}</span>) : <span className="text-muted-foreground">None</span>}</div>
          {needsWhatsAppPhone(row) && <span className="admin-warning-text" title="Add a WhatsApp number or remove the WhatsApp channel.">WhatsApp phone missing</span>}
        </TableCell>
        <TableCell><StatusBadge tone={state === 'responded' ? 'positive' : state === 'opened' ? 'warm' : 'neutral'}>{INVITATION_LABELS[state]}</StatusBadge></TableCell>
        <TableCell><div className="admin-cell-lines">{invited.length ? invited.map(event => {
          const reply = row.rsvps.find(value => value.eventSlug === event.slug);
          return <span key={event.slug} title={event.name}>{events.length > 1 ? event.name + ': ' : ''}{!reply ? 'Waiting' : reply.attending ? `Coming · ${reply.partyCount}` : 'Declined'}</span>;
        }) : <span className="text-muted-foreground">Not invited</span>}</div></TableCell>
        <TableCell><DialogTrigger render={<Button type="button" variant="outline" />} aria-label={'View or edit ' + row.guest.displayName}>View / edit</DialogTrigger>{success && <span role="status" className="sr-only">{success}</span>}</TableCell>
      </TableRow>
      {loaded && <DialogContent keepMounted className="admin-dialog-wide" showCloseButton={!deleting}>
        <DialogHeader><DialogTitle>{row.guest.displayName}</DialogTitle><DialogDescription>Edit household details, numbers, invitations and sending channels.</DialogDescription></DialogHeader>
        {loaded && <fieldset disabled={deleting} className="min-w-0" data-admin-editing><GuestEditor events={events} guest={row.guest} invitedSlugs={row.eventSlugs} channels={row.channels.map(channel => channel.channel)} onDone={message => { setOpen(false); setLoaded(false); setSuccess(message); }} /></fieldset>}
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">Response and activity</h3>
          {row.rsvps.length ? row.rsvps.map(reply => <div key={reply.eventSlug} className="space-y-1">
            <p>{events.length > 1 && <strong>{events.find(event => event.slug === reply.eventSlug)?.name}: </strong>}{reply.attending ? `${reply.partyCount} guests coming` : 'Unable to attend'} · {SOURCE_LABELS[reply.source]}</p>
            {reply.attendeeNames && <p className="text-muted-foreground">{reply.attendeeNames}</p>}
            <p className="text-xs text-muted-foreground">Updated {formatDateTimeShort(new Date(reply.updatedAt), timezone)}{reply.recordedBy ? ' · ' + reply.recordedBy : ''}</p>
          </div>) : <p className="text-muted-foreground">No reply recorded.</p>}
          {row.message && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3"><strong>Guest message: </strong>{row.message}</p>}
          <p className="text-sm text-muted-foreground">First opened: {row.firstOpen ? formatDateTimeShort(new Date(row.firstOpen), timezone) : 'Not yet'} · Last opened: {row.lastOpen ? formatDateTimeShort(new Date(row.lastOpen), timezone) : 'Not yet'}</p>
          <div className="flex flex-wrap gap-2"><Link href={'/admin/rsvps?guest=' + row.guest.id} className={buttonVariants({ variant: 'outline' })}>Record a reply</Link><Link href={'/admin/send?q=' + encodeURIComponent(row.guest.displayName)} className={buttonVariants({ variant: 'outline' })}>View invitation</Link></div>
        </section>
        <section className="space-y-3 border-t pt-5">
          {!confirmDelete ? <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>Delete this household…</Button> : <>
            <p className="text-sm">Permanently delete this household, replies, history, messages, sending records and opening activity? Its invitation link will stop working.</p>
            <div className="flex gap-2"><Button type="button" variant="destructive" disabled={deleting} onClick={removeGuest}>{deleting ? 'Deleting…' : 'Permanently delete household'}</Button><Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep household</Button></div>
          </>}
          <Feedback error={deleteError} />
        </section>
      </DialogContent>}
    </Dialog>
  );
}
