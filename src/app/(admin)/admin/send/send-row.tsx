'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { whatsappSendUrl } from '@/lib/domain/urls';
import type { DeliveryState } from '@/lib/domain/delivery';
import type { DeliveryChannelName, DeliveryStatus, Side } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { CHANNEL_LABELS, INVITATION_LABELS, SIDE_LABELS } from '../_components/presentation';
import { Feedback, StatusBadge } from '../_components/ui';
import { PhoneNumbers } from '../_components/phone-numbers';

type Props = {
  guestId: string; displayName: string; side: Side; phone: string | null; invitationUrl: string;
  message: string; plainMessage: string; whatsappNumbers: string[]; state: DeliveryState;
  firstOpenedAt: string | null; lastOpenedAt: string | null;
  channels: { channel: DeliveryChannelName; status: DeliveryStatus }[];
};
type CopyTarget = 'whatsapp' | 'plain' | 'link';
const statusLabels = { pending: 'Not sent', sent: 'Sent', delivered: 'Delivered' };

export function SendRow({ guestId, displayName, side, phone, invitationUrl, message, plainMessage, whatsappNumbers, state, firstOpenedAt, lastOpenedAt, channels }: Props) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [manualCopy, setManualCopy] = useState<CopyTarget | null>(null);
  const [number, setNumber] = useState(whatsappNumbers[0] ?? '');
  const [method, setMethod] = useState<DeliveryChannelName>('whatsapp');
  const [confirmReset, setConfirmReset] = useState<DeliveryChannelName | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<DeliveryChannelName | null>(null);
  const available = (Object.keys(CHANNEL_LABELS) as DeliveryChannelName[]).filter(name => !channels.some(channel => channel.channel === name));
  const hasWhatsApp = channels.some(channel => channel.channel === 'whatsapp');
  const showPlainMessage = !hasWhatsApp || channels.some(channel => channel.channel !== 'whatsapp');
  const needsPhone = hasWhatsApp && whatsappNumbers.length === 0;
  const chosenNumber = whatsappNumbers.includes(number) ? number : whatsappNumbers[0];
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(null), 2500); return () => window.clearTimeout(timer); }, [copied]);
  async function update(channel: DeliveryChannelName, status: DeliveryStatus) {
    setBusy(true); setError(null); setSuccess(null);
    const result = await postJson('/api/admin/delivery', { guestId, channel, status, sentBy: 'admin' });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setConfirmReset(null); setSuccess(CHANNEL_LABELS[channel] + ' record updated.'); router.refresh();
  }
  async function remove(channel: DeliveryChannelName) {
    setBusy(true); setError(null); setSuccess(null);
    const result = await postJson('/api/admin/delivery', { guestId, channel }, 'DELETE');
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setConfirmRemove(null); setSuccess(CHANNEL_LABELS[channel] + ' channel removed.'); router.refresh();
  }
  const copyValue = (target: CopyTarget) => target === 'link' ? invitationUrl : target === 'plain' ? plainMessage : message;
  async function copy(target: CopyTarget) {
    setCopied(null);
    try { await navigator.clipboard.writeText(copyValue(target)); setManualCopy(null); setCopied(target); }
    catch { setManualCopy(target); setLoaded(true); setOpen(true); }
  }
  const openedAt = lastOpenedAt ?? firstOpenedAt;
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); if (value) setLoaded(true); } }}>
      <TableRow>
        <TableCell><span className="admin-name" title={displayName}>{displayName}</span></TableCell>
        <TableCell>{SIDE_LABELS[side]}</TableCell>
        <TableCell><PhoneNumbers value={phone} /></TableCell>
        <TableCell><div className="admin-cell-badges">{channels.length ? channels.map(channel => <span key={channel.channel} className="admin-channel-tag" title={statusLabels[channel.status]}>{CHANNEL_LABELS[channel.channel]}</span>) : <span className="text-muted-foreground">None</span>}</div>{needsPhone && <span className="admin-warning-text">WhatsApp phone missing</span>}</TableCell>
        <TableCell><StatusBadge tone={state === 'responded' ? 'positive' : state === 'opened' ? 'warm' : 'neutral'}>{INVITATION_LABELS[state]}</StatusBadge></TableCell>
        <TableCell><span className="admin-date">{openedAt ?? 'Not opened'}</span></TableCell>
        <TableCell><div className="admin-invitation-actions">
          {hasWhatsApp && (chosenNumber ? <>
            {whatsappNumbers.length > 1 && <select className="admin-select" aria-label={'WhatsApp number for ' + displayName} value={chosenNumber} onChange={event => setNumber(event.target.value)}>{whatsappNumbers.map(value => <option key={value} value={value}>{value}</option>)}</select>}
            <a href={whatsappSendUrl(chosenNumber, message)} target="_blank" rel="noreferrer noopener" className={buttonVariants({ className: 'admin-button' })} aria-label={'WhatsApp for ' + displayName}>WhatsApp</a>
          </> : <Link href={'/admin/guests?q=' + encodeURIComponent(displayName)} className={buttonVariants({ variant: 'outline', className: 'admin-button' })} aria-label={'Add WhatsApp number for ' + displayName}>Add number</Link>)}
          {hasWhatsApp && <Button type="button" variant="outline" onClick={() => copy('whatsapp')} aria-label={'Copy WhatsApp message for ' + displayName}>{copied === 'whatsapp' ? 'Copied' : showPlainMessage ? 'Copy WhatsApp' : 'Copy message'}</Button>}
          {showPlainMessage && <Button type="button" variant="outline" onClick={() => copy('plain')} aria-label={'Copy plain text message for ' + displayName}>{copied === 'plain' ? 'Copied' : hasWhatsApp ? 'Copy plain text' : 'Copy message'}</Button>}
        </div>
        </TableCell>
        <TableCell><div className="admin-row-actions"><Button type="button" variant="outline" onClick={() => copy('link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</Button><DialogTrigger render={<Button type="button" variant="outline" />} aria-label={'Sending details for ' + displayName}>Details</DialogTrigger></div><span role="status" className="sr-only">{copied ? 'Copied ' + (copied === 'link' ? 'invitation link' : 'message') + ' for ' + displayName : ''}</span></TableCell>
      </TableRow>
      {loaded && <DialogContent keepMounted className="admin-dialog-wide" showCloseButton={!busy}>
        <DialogHeader><DialogTitle>Sending details · {displayName}</DialogTitle><DialogDescription>Manage channels and sending progress, or copy the invitation text.</DialogDescription></DialogHeader>
        <p className="text-sm text-muted-foreground">{firstOpenedAt ? 'First opened: ' + firstOpenedAt + '. Last opened: ' + openedAt + '.' : 'The personal invitation link has not been opened yet.'}</p>
        {needsPhone && <p className="admin-warning">WhatsApp needs a phone number. <a className="underline" href={'/admin/guests?q=' + encodeURIComponent(displayName)}>Add a number</a>, or remove WhatsApp and select another channel below.</p>}
        {channels.length === 0 && <p className="text-muted-foreground">No sending channel selected yet.</p>}
        <div className="space-y-3">{channels.map(channel => <div key={channel.channel} className="admin-channel-record">
          <span className="font-medium">{CHANNEL_LABELS[channel.channel]}</span>
          <select className="admin-select" aria-label={'Sending status for ' + CHANNEL_LABELS[channel.channel] + ' · ' + displayName} value={channel.status} disabled={busy} onChange={event => { const status = event.target.value as DeliveryStatus; if (status === 'pending' && channel.status !== 'pending') setConfirmReset(channel.channel); else void update(channel.channel, status); }}><option value="pending">Not sent</option><option value="sent">Sent</option><option value="delivered">Delivered</option></select>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(channel.channel)}>Remove</Button>
          {confirmReset === channel.channel && <div className="admin-channel-confirm"><p>Clear this channel’s sent date and mark it not sent?</p><Button type="button" variant="outline" disabled={busy} onClick={() => update(channel.channel, 'pending')}>Reset sending status</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmReset(null)}>Cancel</Button></div>}
          {confirmRemove === channel.channel && <div className="admin-channel-confirm"><p>Remove {CHANNEL_LABELS[channel.channel]} and its sending record?</p><Button type="button" variant="destructive" disabled={busy} onClick={() => remove(channel.channel)}>Remove channel</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(null)}>Keep channel</Button></div>}
        </div>)}</div>
        {available.length > 0 && <div className="space-y-2 border-t pt-4"><label htmlFor={id + '-method'}>Add a sending channel</label><div className="flex gap-2"><select id={id + '-method'} className="admin-select" value={available.includes(method) ? method : available[0]} onChange={event => setMethod(event.target.value as DeliveryChannelName)} disabled={busy}>{available.map(value => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}</select><Button type="button" variant="outline" disabled={busy} onClick={() => update(available.includes(method) ? method : available[0]!, 'pending')}>Add channel</Button></div></div>}
        <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Invitation message</h3><p className="text-sm text-muted-foreground">Use plain text for Instagram, Messenger, WeChat and other channels.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => copy('whatsapp')}>Copy WhatsApp message</Button><Button type="button" variant="outline" onClick={() => copy('plain')}>Copy plain text message</Button><Button type="button" variant="outline" onClick={() => copy('link')}>Copy invitation link</Button></div></section>
        {manualCopy && <div className="space-y-2"><label htmlFor={id + '-copy'}>Select and copy the {manualCopy === 'link' ? 'link' : 'message'} below.</label>{manualCopy === 'link' ? <Input id={id + '-copy'} value={invitationUrl} readOnly onFocus={event => event.target.select()} autoFocus /> : <Textarea id={id + '-copy'} value={copyValue(manualCopy)} readOnly rows={7} onFocus={event => event.target.select()} autoFocus style={{ fieldSizing: 'fixed' }} />}</div>}
        <Feedback error={error} success={success} />
      </DialogContent>}
    </Dialog>
  );
}
