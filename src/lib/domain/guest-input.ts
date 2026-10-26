import { z } from 'zod';
import { DELIVERY_CHANNELS, LOCALES, SIDES } from '@/db/schema';
import { PHONE_LIST_MAX_LENGTH, phoneListError } from './phone.ts';

/** Shared by manual guest entry and CSV import, including CSV previews. */
export const guestInputSchema = z.object({
  displayName: z.string().trim().min(1).max(300),
  displayNameFallback: z.string().max(300).nullable().optional(),
  sortName: z.string().trim().min(1).max(300),
  side: z.enum(SIDES),
  language: z.enum(LOCALES).optional(),
  maxPartySize: z.number().int().min(1).max(50),
  phone: z.string().max(PHONE_LIST_MAX_LENGTH).refine((value) => phoneListError(value) === null, {
    message: 'Enter valid phone numbers separated by commas.',
  }).nullable().optional(),
  channels: z.array(z.enum(DELIVERY_CHANNELS)).max(DELIVERY_CHANNELS.length).optional(),
  notes: z.string().max(4000).nullable().optional(),
  eventSlugs: z.array(z.string().min(1)).max(20).optional(),
});

export type GuestInputRequest = z.infer<typeof guestInputSchema>;
