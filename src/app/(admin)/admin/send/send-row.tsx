'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DeliveryChannelName, DeliveryStatus } from '@/lib/services/types';
import { postJson } from '../_components/api';

type Props = {
  guestId: string;
  displayName: string;
  shortCode: string;
  phone: string | null;
  invitationUrl: string;
  whatsappUrl: string | null;
  channels: { channel: DeliveryChannelName; status: DeliveryStatus }[];
};

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus> = {
  pending: 'sent',
  sent: 'delivered',
  delivered: 'pending',
};

export function SendRow({
  guestId,
  displayName,
  shortCode,
  phone,
  invitationUrl,
  whatsappUrl,
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
    <tr>
      <td className="border px-2 py-1 break-words">{displayName}</td>
      <td className="border px-2 py-1">{phone ?? '-'}</td>
      <td className="border px-2 py-1 font-mono">{shortCode}</td>
      <td className="border px-2 py-1">
        <button type="button" onClick={copyLink} className="underline">
          {copied ? 'copied' : 'copy link'}
        </button>
      </td>
      <td className="border px-2 py-1">
        {whatsappUrl ? (
          <a href={whatsappUrl} target="_blank" rel="noreferrer noopener" className="underline">
            open WhatsApp
          </a>
        ) : (
          <span className="text-gray-500">no phone</span>
        )}
      </td>
      <td className="border px-2 py-1">
        {channels.length === 0 && <span className="text-gray-500">none</span>}
        {channels.map((c) => (
          <button
            key={c.channel}
            type="button"
            onClick={() => cycle(c.channel, c.status)}
            disabled={busy}
            className="mr-2 underline disabled:opacity-50"
            title="Click to advance: pending -> sent -> delivered"
          >
            {c.channel}:{c.status}
          </button>
        ))}
        {error && <span className="text-red-700"> {error}</span>}
      </td>
    </tr>
  );
}
