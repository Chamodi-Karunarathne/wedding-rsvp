import { z } from 'zod';
import { PHASES, type Phase } from './phase.ts';

/**
 * PERMANENT. Shape and defaults for the site_config table.
 *
 * site_config is one row per logical key, each with its own schema. Missing
 * keys fall back to the defaults below, so a freshly migrated database renders
 * rather than crashing.
 */

export const CONFIG_KEYS = ['phase', 'site', 'messaging'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/* -------------------------------------------------------------------------- */
/* schemas                                                                    */
/* -------------------------------------------------------------------------- */

export const phaseConfigSchema = z.object({
  detailsOpenAt: z.coerce.date(),
  dayOfStartAt: z.coerce.date(),
  thankYouAt: z.coerce.date(),
  phaseOverride: z.enum(PHASES).nullable(),
});

export const siteSettingsSchema = z.object({
  brideName: z.string().min(1),
  groomName: z.string().min(1),
  /** IANA zone. Every guest-facing date is formatted in this zone, not the
   *  viewer's, so a guest abroad sees the local time of the wedding. */
  timezone: z.string().min(1),
});

export const messagingConfigSchema = z.object({
  /** Placeholders: {{name}}, {{url}}, {{code}}. */
  whatsappTemplate: z.string().min(1),
});

export type PhaseConfigValues = z.infer<typeof phaseConfigSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type MessagingConfig = z.infer<typeof messagingConfigSchema>;

export type AppConfig = {
  phase: PhaseConfigValues;
  site: SiteSettings;
  messaging: MessagingConfig;
};

export const CONFIG_SCHEMAS = {
  phase: phaseConfigSchema,
  site: siteSettingsSchema,
  messaging: messagingConfigSchema,
} as const;

/* -------------------------------------------------------------------------- */
/* defaults                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * PLACEHOLDER VALUES. Every one of these is expected to be replaced from
 * /admin/config before anything is sent to a real guest.
 *
 * The date below is a stand-in for "mid-December 2026" - Saturday 12 December
 * 2026 - chosen so the seeded data is coherent. Times are Asia/Colombo
 * (UTC+05:30) expressed here in UTC.
 */
export const PLACEHOLDER_WEDDING_DATE = '2026-12-12';
export const DEFAULT_TIMEZONE = 'Asia/Colombo';

export const DEFAULT_PHASE_CONFIG: PhaseConfigValues = {
  // Details open six weeks out.
  detailsOpenAt: new Date('2026-11-01T00:00:00.000Z'),
  // Local midnight on the wedding day.
  dayOfStartAt: new Date('2026-12-11T18:30:00.000Z'),
  // Local midnight the following day.
  thankYouAt: new Date('2026-12-12T18:30:00.000Z'),
  phaseOverride: null,
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brideName: 'Bride',
  groomName: 'Groom',
  timezone: DEFAULT_TIMEZONE,
};

export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  whatsappTemplate:
    'Dear {{name}}, we would love for you to join us at our wedding. ' +
    'Your invitation is here: {{url}} (code {{code}})',
};

export const DEFAULT_CONFIG: AppConfig = {
  phase: DEFAULT_PHASE_CONFIG,
  site: DEFAULT_SITE_SETTINGS,
  messaging: DEFAULT_MESSAGING_CONFIG,
};

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Fills {{name}}, {{url}} and {{code}}. Unknown placeholders are left alone. */
export function renderTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/** Phase dates must be strictly increasing for the phases to be reachable. */
export function validatePhaseOrdering(
  values: PhaseConfigValues,
): { ok: true } | { ok: false; message: string } {
  if (values.detailsOpenAt >= values.dayOfStartAt) {
    return { ok: false, message: 'detailsOpenAt must be before dayOfStartAt.' };
  }
  if (values.dayOfStartAt >= values.thankYouAt) {
    return { ok: false, message: 'dayOfStartAt must be before thankYouAt.' };
  }
  return { ok: true };
}

export type { Phase };
