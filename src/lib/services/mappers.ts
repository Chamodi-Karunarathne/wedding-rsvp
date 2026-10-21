import type {
  DeliveryChannelRow,
  EventRow,
  GuestRow,
  RsvpRow,
} from '@/db/schema';
import { resolveCardName } from '@/lib/domain/names';
import type { DeliveryChannelView, EventView, GuestView, RsvpView } from './types';

/** PERMANENT. Drizzle rows in, boundary view models out. The only place that
 *  knows both shapes. */

export function toGuestView(row: GuestRow): GuestView {
  return {
    id: row.id,
    token: row.token,
    displayName: row.displayName,
    displayNameFallback: row.displayNameFallback,
    // The one place the fallback rule is applied.
    cardName: resolveCardName(row.displayName, row.displayNameFallback),
    sortName: row.sortName,
    side: row.side,
    language: row.language,
    maxPartySize: row.maxPartySize,
    phone: row.phone,
    notes: row.notes,
  };
}

export function toEventView(row: EventRow): EventView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    startsAt: row.startsAt,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
    mapUrl: row.mapUrl,
    dressCode: row.dressCode,
    sortOrder: row.sortOrder,
  };
}

export function toRsvpView(row: RsvpRow, eventSlug: string): RsvpView {
  return {
    eventSlug,
    attending: row.attending,
    partyCount: row.partyCount,
    attendeeNames: row.attendeeNames,
    source: row.source,
    recordedBy: row.recordedBy,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
  };
}

export function toDeliveryChannelView(row: DeliveryChannelRow): DeliveryChannelView {
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    sentAt: row.sentAt,
    sentBy: row.sentBy,
    notes: row.notes,
  };
}
