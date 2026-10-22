'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { DeliveryState } from '@/lib/domain/delivery';
import type { DeliveryChannelName, DeliveryStatus } from '@/lib/services/types';
import { postJson } from '../_components/api';
import { CHANNEL_LABELS, INVITATION_LABELS } from '../_components/presentation';
import { Feedback, StatusBadge } from '../_components/ui';

type Props = {
  guestId: string;
  displayName: string;
  phone: string | null;
  invitationUrl: string;
  message: string;
  whatsappUrl: string | null;
  state: DeliveryState;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  channels: { channel: DeliveryChannelName; status: DeliveryStatus }[];
};
type CopyTarget = 'message' | 'link';
const statusLabels = { pending: 'Not sent', sent: 'Sent', delivered: 'Delivered' };

export function SendRow({
  guestId,
  displayName,
  phone,
  invitationUrl,
  message,
  whatsappUrl,
  state,
  firstOpenedAt,
  lastOpenedAt,
  channels,
}: Props) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [manualCopy, setManualCopy] = useState<CopyTarget | null>(null);
  const [method, setMethod] = useState<DeliveryChannelName>('whatsapp');
  const available = (Object.keys(CHANNEL_LABELS) as DeliveryChannelName[]).filter(
    (name) => !channels.some((channel) => channel.channel === name),
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function update(
    channel: DeliveryChannelName,
    status: DeliveryStatus,
    previous?: DeliveryStatus,
  ) {
    if (
      status === 'pending' &&
      previous &&
      previous !== 'pending' &&
      !window.confirm(
        'Mark this invitation as not sent?\n\nThis will clear its sent date and return this sending method to Not sent. The personal invitation link will keep working.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await postJson('/api/admin/delivery', {
      guestId,
      channel,
      status,
      sentBy: 'admin',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess(CHANNEL_LABELS[channel] + ' record updated.');
    router.refresh();
  }

  async function copy(target: CopyTarget) {
    setCopied(null);
    try {
      await navigator.clipboard.writeText(target === 'message' ? message : invitationUrl);
      setManualCopy(null);
      setCopied(target);
    } catch {
      setManualCopy(target);
    }
  }

  const action = state === 'sent' ? 'Send again' : 'WhatsApp';
  const progressHint = state === 'responded'
    ? 'A reply has been recorded online or by phone.'
    : state === 'opened'
      ? 'Opened the link. Waiting for a reply.'
      : state === 'sent'
        ? 'Marked sent. No opening recorded yet.'
        : 'Ready to prepare and send.';
  const openedAt = lastOpenedAt ?? firstOpenedAt;

  return (
    <TableRow>
      <TableCell data-label="Guest / Family">
        <span className="admin-name">{displayName}</span>
        <span className="admin-row-subtext">
          {phone ? <a href={'tel:' + phone}>{phone}</a> : 'No phone number'}
        </span>
      </TableCell>
      <TableCell data-label="Progress">
        <span title={progressHint}>
          <StatusBadge
            tone={state === 'responded' ? 'positive' : state === 'opened' ? 'warm' : 'neutral'}
          >
            {INVITATION_LABELS[state]}
          </StatusBadge>
        </span>
        <span className="admin-row-subtext">
          {openedAt ? <>Link opened <span className="admin-opened-at">{openedAt}</span></> : 'Link not opened'}
        </span>
      </TableCell>
      <TableCell data-label="Actions">
        <div className="admin-invitation-actions">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonVariants({ className: 'admin-button' })}
              aria-label={action + ' for ' + displayName}
            >
              {action}
            </a>
          )}
          <Button type="button" variant="outline" onClick={() => copy('message')}>
            {copied === 'message' ? 'Message copied' : 'Copy message'}
          </Button>
          <Button type="button" variant="outline" onClick={() => copy('link')}>
            {copied === 'link' ? 'Link copied' : 'Copy link'}
          </Button>
        </div>
        <p role="status" className="sr-only">
          {copied ? (copied === 'message' ? 'Invitation message' : 'Invitation link') + ' copied for ' + displayName + '.' : ''}
        </p>
        {manualCopy && (
          <div className="admin-invitation-copy">
            <label htmlFor={id + '-copy'}>
              Select and copy the {manualCopy === 'message' ? 'message' : 'link'} below.
            </label>
            {manualCopy === 'message' ? (
              <Textarea
                id={id + '-copy'}
                aria-label={'Invitation message for ' + displayName}
                readOnly
                autoFocus
                value={message}
                onFocus={(event) => event.target.select()}
                rows={6}
                style={{ fieldSizing: 'fixed' }}
              />
            ) : (
              <Input
                id={id + '-copy'}
                aria-label={'Invitation link for ' + displayName}
                readOnly
                autoFocus
                value={invitationUrl}
                onFocus={(event) => event.target.select()}
              />
            )}
            <Button type="button" variant="ghost" onClick={() => setManualCopy(null)}>
              Close copy field
            </Button>
          </div>
        )}
        <details className="admin-invitation-details">
          <summary>Sending details</summary>
          <div className="admin-invitation-detail-body">
            <p className="text-xs text-muted-foreground">{progressHint}</p>
            <p className="text-xs text-muted-foreground">
              {firstOpenedAt ? 'First opened: ' + firstOpenedAt + '. Last opened: ' + openedAt + '.' : 'The personal invitation link has not been opened yet.'}
            </p>
            {!phone && (
              <a href={'/admin/guests?q=' + encodeURIComponent(displayName)} className="underline">
                Add a phone number to send through WhatsApp
              </a>
            )}
            {channels.length === 0 && (
              <div className="admin-invitation-channel">
                <span>No sending record yet</span>
                <Button type="button" variant="outline" disabled={busy} onClick={() => update('whatsapp', 'sent')}>
                  {busy ? 'Saving…' : 'Mark WhatsApp sent'}
                </Button>
              </div>
            )}
            {channels.map((channel) => (
              <div key={channel.channel} className="admin-invitation-channel">
                <span>{CHANNEL_LABELS[channel.channel]} · {statusLabels[channel.status]}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => update(
                    channel.channel,
                    channel.status === 'pending' ? 'sent' : channel.status === 'sent' ? 'delivered' : 'pending',
                    channel.status,
                  )}
                >
                  {busy ? 'Saving…' : channel.status === 'pending' ? 'Mark as sent' : channel.status === 'sent' ? 'Mark delivered' : 'Mark not sent'}
                </Button>
              </div>
            ))}
            {available.length > 0 && (
              <div className="admin-invitation-method">
                <label htmlFor={id + '-method'} className="text-xs">Another sending method</label>
                <div className="admin-invitation-channel">
                  <select
                    id={id + '-method'}
                    className="admin-select"
                    value={available.includes(method) ? method : available[0]}
                    onChange={(event) => setMethod(event.target.value as DeliveryChannelName)}
                    disabled={busy}
                  >
                    {available.map((value) => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => update(available.includes(method) ? method : available[0]!, 'pending')}
                  >
                    Add method
                  </Button>
                </div>
              </div>
            )}
          </div>
        </details>
        <Feedback error={error} success={success} />
      </TableCell>
    </TableRow>
  );
}
