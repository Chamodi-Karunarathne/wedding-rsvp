import { z } from 'zod';
import { DELIVERY_CHANNELS, DELIVERY_STATUSES, LOCALES, SIDES } from '@/db/schema';
import { PHASES } from '@/lib/domain/phase';

/** PERMANENT. Zod schema for every API input. Inferred types are exported. */

/* -------------------------------------------------------------------------- */
/* POST /api/rsvp                                                             */
/* -------------------------------------------------------------------------- */

export const rsvpResponseSchema = z.object({
  eventSlug: z.string().min(1),
  attending: z.boolean(),
  // Bounds against max_party_size are checked server-side in the domain layer,
  // where the guest's own record is known. This only rejects nonsense.
  partyCount: z.number().int().min(0).max(1000),
  attendeeNames: z.string().max(2000).nullable().optional(),
});

export const rsvpRequestSchema = z.object({
  token: z.string().min(1).max(64),
  responses: z.array(rsvpResponseSchema).max(20),
  /** Omitted leaves any existing message alone; '' deletes it. */
  message: z.string().max(4000).nullable().optional(),
});

export type RsvpRequest = z.infer<typeof rsvpRequestSchema>;
export type RsvpResponseInput = z.infer<typeof rsvpResponseSchema>;

/* -------------------------------------------------------------------------- */
/* admin                                                                      */
/* -------------------------------------------------------------------------- */

export const guestInputSchema = z.object({
  displayName: z.string().min(1).max(300),
  /**
   * Long names break the fixed-width card. Admin warns above
   * DISPLAY_NAME_SOFT_LIMIT and offers this shorter form, but nothing is
   * blocked here - a warning the family can overrule is the point.
   */
  displayNameFallback: z.string().max(300).nullable().optional(),
  sortName: z.string().min(1).max(300),
  side: z.enum(SIDES),
  language: z.enum(LOCALES).optional(),
  maxPartySize: z.number().int().min(1).max(50),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  eventSlugs: z.array(z.string().min(1)).max(20).optional(),
});

export type GuestInputRequest = z.infer<typeof guestInputSchema>;

export const guestUpdateSchema = guestInputSchema.partial().extend({
  id: z.string().uuid(),
});

export const guestDeleteSchema = z.object({ id: z.string().uuid() });

export const proxyRsvpSchema = z.object({
  guestId: z.string().uuid(),
  responses: z.array(rsvpResponseSchema).max(20),
  message: z.string().max(4000).nullable().optional(),
  recordedBy: z.string().min(1).max(100),
  source: z.enum(['admin', 'phone']).default('phone'),
});

export const deliveryChannelSchema = z.object({
  guestId: z.string().uuid(),
  channel: z.enum(DELIVERY_CHANNELS),
  status: z.enum(DELIVERY_STATUSES),
  sentBy: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const phaseConfigInputSchema = z.object({
  detailsOpenAt: z.string().min(1),
  rsvpDeadline: z.string().min(1),
  dayOfStartAt: z.string().min(1),
  thankYouAt: z.string().min(1),
  phaseOverride: z.enum(PHASES).nullable(),
});

export const siteSettingsInputSchema = z.object({
  brideName: z.string().min(1).max(100),
  groomName: z.string().min(1).max(100),
  timezone: z.string().min(1).max(64),
  /** Who to telephone, as printed on the card. */
  rsvpContacts: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        phone: z.string().min(1).max(40),
        side: z.string().max(40),
      }),
    )
    .max(4),
});

export const messagingConfigInputSchema = z.object({
  whatsappTemplate: z.string().min(1).max(2000),
});

export const csvImportSchema = z.object({
  csv: z.string().min(1),
  /** Event slugs applied to every imported row that does not specify its own. */
  defaultEventSlugs: z.array(z.string().min(1)).max(20).optional(),
  dryRun: z.boolean().optional(),
});

export type CsvImportRequest = z.infer<typeof csvImportSchema>;
