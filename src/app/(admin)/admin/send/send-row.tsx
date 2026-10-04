'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
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
  whatsappUrl: string | null;
  state: DeliveryState;
  channels: { channel: DeliveryChannelName; status: DeliveryStatus }[];
};
const statusLabels = { pending: 'Not sent', sent: 'Sent', delivered: 'Delivered' };

export function SendRow({
  guestId,
  displayName,
  phone,
  invitationUrl,
  whatsappUrl,
  state,
  channels,
}: Props) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [method, setMethod] = useState<DeliveryChannelName>('whatsapp');
  const available = (Object.keys(CHANNEL_LABELS) as DeliveryChannelName[]).filter(
    (name) => !channels.some((channel) => channel.channel === name),
  );
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
  async function copyLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowLink(true);
      setError('Select the invitation link below and copy it to your message.');
    }
  }
  const action =
    state === 'not_sent'
      ? 'Send via WhatsApp'
      : state === 'sent'
        ? 'Send again'
        : state === 'opened'
          ? 'Follow up'
          : 'Open WhatsApp';
  return (
    <TableRow>
      <TableCell data-label="Guest / Family">
        <span className="admin-name">{displayName}</span>
        <span className="admin-row-subtext">
          {phone ? <a href={'tel:' + phone}>{phone}</a> : 'No phone number added'}
        </span>
      </TableCell>
      <TableCell data-label="Progress">
        <StatusBadge
          tone={state === 'responded' ? 'positive' : state === 'opened' ? 'warm' : 'neutral'}
        >
          {INVITATION_LABELS[state]}
        </StatusBadge>
        <span className="admin-row-subtext">
          {state === 'opened'
            ? 'Opened the link. Waiting for a reply.'
            : state === 'sent'
              ? 'Marked sent. No opening recorded yet.'
              : state === 'responded'
                ? 'A reply has been recorded.'
                : 'Ready to prepare and send.'}
        </span>
      </TableCell>
      <TableCell data-label="Actions">
        <div className="flex flex-wrap gap-2">
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonVariants({ className: 'admin-button' })}
            >
              {action}
            </a>
          ) : (
            <a
              href={'/admin/guests?q=' + encodeURIComponent(displayName)}
              className={buttonVariants({ variant: 'outline', className: 'admin-button' })}
            >
              Add a phone number
            </a>
          )}
          <Button type="button" variant="outline" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy invitation link'}
          </Button>
        </div>
        <span className="admin-row-subtext" role="status">
          {copied
            ? 'Ready to paste into your message.'
            : whatsappUrl
              ? 'Send the prepared message in WhatsApp.'
              : 'You can also copy the link and send it yourself.'}
        </span>
        {showLink && (
          <Input
            aria-label={'Invitation link for ' + displayName}
            readOnly
            value={invitationUrl}
            onFocus={(e) => e.target.select()}
            className="mt-2"
          />
        )}
      </TableCell>
      <TableCell data-label="Sending record">
        <div className="space-y-3">
          {channels.length === 0 && (
            <>
              <p className="text-xs text-muted-foreground">No sending record yet.</p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => update('whatsapp', 'sent')}
              >
                {busy ? 'Saving…' : 'Mark WhatsApp sent'}
              </Button>
            </>
          )}
          {channels.map((channel) => (
            <div key={channel.channel} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {CHANNEL_LABELS[channel.channel]} · {statusLabels[channel.status]}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  update(
                    channel.channel,
                    channel.status === 'pending'
                      ? 'sent'
                      : channel.status === 'sent'
                        ? 'delivered'
                        : 'pending',
                    channel.status,
                  )
                }
              >
                {busy
                  ? 'Saving…'
                  : channel.status === 'pending'
                    ? 'Mark as sent'
                    : channel.status === 'sent'
                      ? 'Mark delivered'
                      : 'Mark not sent'}
              </Button>
            </div>
          ))}
          {available.length > 0 && (
            <details className="text-xs">
              <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
                Another sending method
              </summary>
              <div className="space-y-2">
                <label htmlFor={id + '-method'} className="sr-only">
                  Sending method
                </label>
                <select
                  id={id + '-method'}
                  className="admin-select"
                  value={available.includes(method) ? method : available[0]}
                  onChange={(e) => setMethod(e.target.value as DeliveryChannelName)}
                  disabled={busy}
                >
                  {available.map((value) => (
                    <option key={value} value={value}>
                      {CHANNEL_LABELS[value]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    update(available.includes(method) ? method : available[0]!, 'pending')
                  }
                >
                  Add sending method
                </Button>
              </div>
            </details>
          )}
          <Feedback error={error} success={success} />
        </div>
      </TableCell>
    </TableRow>
  );
}
