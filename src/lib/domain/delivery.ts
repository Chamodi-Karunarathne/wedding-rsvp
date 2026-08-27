/**
 * PERMANENT. Pure, dependency-free, and unit tested.
 *
 * Where a household has got to, as one value.
 *
 * This matters more than it used to. Every guest now arrives through a link
 * someone sent them, so guest_opens is the only thing separating "has not
 * seen it" from "has seen it and not replied" - which is the difference
 * between resending a link and picking up the phone.
 */

export const DELIVERY_STATES = ['not_sent', 'sent', 'opened', 'responded'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/** Statuses that mean the invitation actually left our hands. */
const SENT_STATUSES = new Set(['sent', 'delivered']);

export type DeliveryProgress = {
  channels: readonly { status: string }[];
  /** From guest_opens. Null means nobody has loaded their invitation. */
  firstOpen: Date | null;
  hasResponse: boolean;
};

/**
 * The furthest point reached, never an average.
 *
 * A guest who telephoned their answer without ever opening the link is
 * 'responded': the states are a high-water mark, not a sequence every
 * household walks in order.
 */
export function deliveryState(progress: DeliveryProgress): DeliveryState {
  if (progress.hasResponse) return 'responded';
  if (progress.firstOpen) return 'opened';
  if (progress.channels.some((channel) => SENT_STATUSES.has(channel.status))) return 'sent';
  return 'not_sent';
}

export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  not_sent: 'not sent',
  sent: 'sent',
  opened: 'opened',
  responded: 'responded',
};
