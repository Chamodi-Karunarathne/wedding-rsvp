import { deliveryState } from '@/lib/domain/delivery';
import type { GuestListRow } from '@/lib/services/guests';
import type { DeliveryChannelName, RsvpSource, Side } from '@/lib/services/types';
import type { Phase } from '@/lib/domain/phase';
import { splitPhoneNumbers } from '@/lib/domain/phone';

export const SIDE_LABELS: Record<Side, string> = {
  bride: "Bride's family",
  groom: "Groom's family",
  both: 'Both families',
};
export const CHANNEL_LABELS: Record<DeliveryChannelName, string> = {
  whatsapp: 'WhatsApp',
  print: 'Printed card',
  instagram: 'Instagram',
  messenger: 'Messenger',
  wechat: 'WeChat',
};

export function needsWhatsAppPhone(row: GuestListRow) {
  return row.channels.some((channel) => channel.channel === 'whatsapp') &&
    splitPhoneNumbers(row.guest.phone).length === 0;
}
export const SOURCE_LABELS: Record<RsvpSource, string> = {
  self: 'Online',
  phone: 'By phone',
  admin: 'Entered by family',
};
export const PHASE_LABELS: Record<Phase, string> = {
  invitation: 'Invitation',
  details: 'Wedding information',
  dayOf: 'Wedding day',
  thankYou: 'Thank you',
};
export const INVITATION_LABELS = {
  not_sent: 'Not sent',
  sent: 'Sent',
  opened: 'Opened',
  responded: 'Replied',
} as const;

export function invitationStatus(row: GuestListRow) {
  return deliveryState({
    channels: row.channels,
    firstOpen: row.firstOpen,
    hasResponse: row.rsvps.length > 0,
  });
}

export function matchesSearch(row: GuestListRow, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return (
    !needle ||
    [row.guest.displayName, row.guest.sortName, row.guest.phone ?? ''].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    )
  );
}

export function matchesReply(row: GuestListRow, status: string) {
  if (status === 'needs_phone') return needsWhatsAppPhone(row);
  if (status === 'waiting')
    return row.eventSlugs.some((slug) => !row.rsvps.some((reply) => reply.eventSlug === slug));
  if (status === 'coming') return row.rsvps.some((reply) => reply.attending);
  if (status === 'declined') return row.rsvps.some((reply) => !reply.attending);
  if (status === 'not_sent') return invitationStatus(row) === 'not_sent';
  return true;
}
