import { z } from 'zod';
import { PHASES, type Phase } from './phase.ts';
import { DEFAULT_TIMEZONE, timeZoneSchema } from './timezone.ts';

export { DEFAULT_TIMEZONE } from './timezone.ts';

/**
 * PERMANENT. Shape and defaults for the site_config table.
 *
 * site_config is one row per logical key, each with its own schema. Missing
 * keys fall back to the defaults below, so a freshly migrated database renders
 * rather than crashing.
 *
 * The defaults are the real dates, not placeholders, and each one can be
 * overridden from the environment (see below) so the seed can be re-pointed
 * without a code change. Once a database is seeded, /admin/config is what
 * actually moves them - the environment only supplies the starting values.
 */

export const CONFIG_KEYS = ['phase', 'site', 'messaging'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/* -------------------------------------------------------------------------- */
/* schemas                                                                    */
/* -------------------------------------------------------------------------- */

export const phaseConfigSchema = z.object({
  detailsOpenAt: z.coerce.date(),
  /**
   * Displayed on the RSVP form and NEVER enforced.
   *
   * Late answers are accepted and saved normally: submitted_at already says
   * who was late, and the couple would rather have the data than a locked
   * form. The guest page shows a gentle note after this date, not an error.
   */
  rsvpDeadline: z.coerce.date(),
  dayOfStartAt: z.coerce.date(),
  thankYouAt: z.coerce.date(),
  phaseOverride: z.enum(PHASES).nullable(),
});

export const rsvpContactSchema = z.object({
  name: z.string().min(1).max(80),
  /** Printed and dialled, never parsed. Stored exactly as entered. */
  phone: z.string().min(1).max(40),
  /** "Bride" / "Groom", or blank. Shown in brackets after the number. */
  side: z.string().max(40).default(''),
});

export const siteSettingsSchema = z.object({
  brideName: z.string().min(1),
  groomName: z.string().min(1),
  /** IANA zone. Every guest-facing date is formatted in this zone, not the
   *  viewer's, so a guest abroad sees the local time of the wedding. */
  timezone: timeZoneSchema,
  /**
   * Who to telephone, as printed on the card.
   *
   * Defaulted rather than required, so a site_config row written before this
   * existed still parses instead of collapsing the whole key back to
   * defaults - which would take the couple's names with it.
   */
  rsvpContacts: z.array(rsvpContactSchema).max(4).default([]),
});

export const DEFAULT_PLAIN_TEXT_TEMPLATE =
  'Dear {{name}},\n\n' +
  '{{brideName}} and {{groomName}} invite you to their wedding on {{date}}.\n\n' +
  'Open your invitation and reply here:\n{{url}}\n\n' +
  'Please reply by {{rsvpBy}}. With love.';

export const messagingConfigSchema = z.object({
  /** Placeholders: {{name}}, {{url}}, {{brideName}}, {{groomName}}, {{date}},
   *  {{rsvpBy}}. */
  whatsappTemplate: z.string().min(1),
  /** A separate plain message for Instagram, Messenger, WeChat and printed delivery. */
  plainTextTemplate: z.string().min(1).default(DEFAULT_PLAIN_TEXT_TEMPLATE),
});

export type PhaseConfigValues = z.infer<typeof phaseConfigSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type RsvpContact = z.infer<typeof rsvpContactSchema>;
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
 * Reads a date from the environment, falling back to the committed value.
 *
 * A malformed override throws rather than quietly reverting: a typo in the
 * wedding date is not something to discover from a guest.
 */
function envDate(name: string, fallback: string): Date {
  const raw = process.env[name];
  const value = raw !== undefined && raw.trim() !== '' ? raw.trim() : fallback;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `${name} is not a valid date: "${raw}". Use an ISO 8601 string with an offset, ` +
        `for example ${fallback}.`,
    );
  }
  return parsed;
}

/**
 * Thursday 3 December 2026, 09:15 Asia/Colombo. One Poruwa ceremony.
 *
 * This seeds events.starts_at and is not stored in site_config: the event row
 * is the single source of truth for when the wedding is, and getPrimaryEvent()
 * is how everything above the data layer asks.
 */
export const EVENT_DATE = envDate('WEDDING_EVENT_DATE', '2026-12-03T09:15:00+05:30');

export const DEFAULT_PHASE_CONFIG: PhaseConfigValues = {
  /*
   * Details open at the start of October, a month before the reply date.
   *
   * They used to open six weeks out, which was defensible while the printed
   * card carried the venue and time. It no longer does - every guest arrives
   * through a link and the site is the only place most of them will look - so
   * opening the details AFTER the reply date would have asked five hundred
   * people to commit before being told where they were going.
   */
  detailsOpenAt: envDate('WEDDING_DETAILS_OPEN_AT', '2026-10-01T00:00:00+05:30'),
  // The last moment a reply still counts as on time. Displayed as a date.
  rsvpDeadline: envDate('WEDDING_RSVP_DEADLINE', '2026-11-03T23:59:59+05:30'),
  dayOfStartAt: envDate('WEDDING_DAY_OF_START_AT', '2026-12-03T06:00:00+05:30'),
  thankYouAt: envDate('WEDDING_THANK_YOU_AT', '2026-12-04T00:00:00+05:30'),
  phaseOverride: null,
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brideName: 'Bride',
  groomName: 'Groom',
  timezone: DEFAULT_TIMEZONE,
  rsvpContacts: [],
};

/** Keep the settings editor usable when an older record contains a bad zone. */
export function readSiteSettings(value: unknown): SiteSettings {
  const parsed = siteSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const recovered = siteSettingsSchema.safeParse({ ...value, timezone: DEFAULT_TIMEZONE });
    if (recovered.success) return recovered.data;
  }
  return DEFAULT_SITE_SETTINGS;
}

/**
 * The message that actually goes out over WhatsApp.
 *
 * Every name and date is a placeholder filled from config at send time, so
 * the wording can be rewritten at /admin/config without a deploy - which it
 * will be, repeatedly, and never at a convenient moment.
 */
export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  plainTextTemplate: DEFAULT_PLAIN_TEXT_TEMPLATE,
  whatsappTemplate:
    'Dear {{name}},\n\n' +
    '{{brideName}} and {{groomName}} would be delighted if you could join them ' +
    'for their wedding on {{date}}.\n\n' +
    'Your invitation, and the RSVP, are here:\n{{url}}\n\n' +
    'Please do let us know by {{rsvpBy}}. With love.',
};

export const DEFAULT_CONFIG: AppConfig = {
  phase: DEFAULT_PHASE_CONFIG,
  site: DEFAULT_SITE_SETTINGS,
  messaging: DEFAULT_MESSAGING_CONFIG,
};

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
  // Deliberately NOT ordered against the phase dates: the reply date is a
  // request to guests, not a boundary in the site's timeline, and it is
  // perfectly reasonable for it to fall anywhere before the day itself.
  if (values.rsvpDeadline >= values.dayOfStartAt) {
    return { ok: false, message: 'rsvpDeadline must be before the day of the wedding.' };
  }
  return { ok: true };
}

export type { Phase };
