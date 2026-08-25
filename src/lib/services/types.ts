import type {
  DeliveryChannelName,
  DeliveryStatus,
  Locale,
  RsvpSource,
  Side,
} from '@/db/schema';
import type { Phase, SectionId } from '@/lib/domain/phase';
import type { SiteSettings } from '@/lib/domain/config';

/**
 * PERMANENT. The boundary between the data layer and everything above it.
 *
 * These are plain view models, not Drizzle row types. The whole point is that
 * app/(guest) can be typed entirely from this file without ever importing
 * drizzle-orm or @/db - so deleting the guest UI, or replacing it with a
 * completely different design, touches nothing underneath.
 */

export type { DeliveryChannelName, DeliveryStatus, Locale, Phase, RsvpSource, SectionId, Side };
export type { SiteSettings };

export type GuestView = {
  id: string;
  token: string;
  shortCode: string;
  displayName: string;
  sortName: string;
  side: Side;
  language: Locale;
  maxPartySize: number;
  phone: string | null;
  postalAddress: string | null;
  personalNote: string | null;
};

export type EventView = {
  id: string;
  slug: string;
  name: string;
  startsAt: Date;
  venueName: string;
  venueAddress: string;
  mapUrl: string | null;
  dressCode: string | null;
  sortOrder: number;
};

export type RsvpView = {
  eventSlug: string;
  attending: boolean;
  partyCount: number;
  attendeeNames: string | null;
  source: RsvpSource;
  recordedBy: string | null;
  submittedAt: Date;
  updatedAt: Date;
};

export type DeliveryChannelView = {
  id: string;
  channel: DeliveryChannelName;
  status: DeliveryStatus;
  sentAt: Date | null;
  sentBy: string | null;
  notes: string | null;
};

/** Everything /i/[token] needs, in one read. */
export type InvitationView = {
  guest: GuestView;
  /** Only the events this guest holds an invitation for, in sort order. */
  events: EventView[];
  /** Existing responses, keyed by event slug. Absent means no response yet. */
  rsvps: Record<string, RsvpView>;
  message: string | null;
  phase: Phase;
  /** Section order for the current phase. Never omits a section. */
  sections: readonly SectionId[];
  site: SiteSettings;
};
