'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { DELIVERY_STATE_LABELS, type DeliveryState } from '@/lib/domain/delivery';
import type { DeliveryChannelName, DeliveryStatus } from '@/lib/services/types';
import { postJson } from '../_components/api';

type Props = {
  guestId: string;
  displayName: string;
  phone: string | null;
  invitationUrl: string;
  whatsappUrl: string | null;
  state: DeliveryState;
  channels: { channel: DeliveryChannelName; status: DeliveryStatus }[];
};

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus> = {
  pending: 'sent',
  sent: 'delivered',
  delivered: 'pending',
};

/** How far along each state reads at a glance. Responded is the finished one. */
const STATE_VARIANT: Record<DeliveryState, 'default' | 'secondary' | 'outline'> = {
  not_sent: 'outline',
  sent: 'secondary',
  opened: 'secondary',
  responded: 'default',
};

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function cycle(channel: DeliveryChannelName, status: DeliveryStatus) {
    setBusy(true);
    setError(null);

    const result = await postJson('/api/admin/delivery', {
      guestId,
      channel,
      status: NEXT_STATUS[status],
      sentBy: 'admin',
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(invitationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="admin-name">{displayName}</span>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{phone ?? '-'}</TableCell>
      <TableCell>
        <Badge variant={STATE_VARIANT[state]}>{DELIVERY_STATE_LABELS[state]}</Badge>
      </TableCell>
      <TableCell>
        <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </TableCell>
      <TableCell>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-4 hover:underline"
          >
            Open WhatsApp
          </a>
        ) : (
          <span className="text-muted-foreground">no phone</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          {channels.length === 0 && <span className="text-muted-foreground">none</span>}
          {channels.map((c) => (
            <Button
              key={c.channel}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cycle(c.channel, c.status)}
              disabled={busy}
              title="Click to advance: pending -> sent -> delivered"
            >
              {c.channel}: {c.status}
            </Button>
          ))}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
