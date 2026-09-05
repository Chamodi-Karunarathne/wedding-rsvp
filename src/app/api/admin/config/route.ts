import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/api/guard';
import {
  messagingConfigInputSchema,
  phaseConfigInputSchema,
  siteSettingsInputSchema,
} from '@/lib/api/schemas';
import { getConfig, setConfigValue } from '@/lib/services/config';
import { fromDateTimeLocalValue } from '@/lib/format';

/** PERMANENT. Phase dates, the manual override, and site settings. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('phase'), value: phaseConfigInputSchema }),
  z.object({ key: z.literal('site'), value: siteSettingsInputSchema }),
  z.object({ key: z.literal('messaging'), value: messagingConfigInputSchema }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = requestSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  let value: unknown = parsed.data.value;

  if (parsed.data.key === 'phase') {
    // The form sends wall-clock strings from <input type="datetime-local">.
    // They must be interpreted in the wedding's timezone, not the server's, or
    // every phase boundary silently shifts by hours once deployed.
    const { site } = await getConfig();
    const phase = parsed.data.value;
    value = {
      detailsOpenAt: fromDateTimeLocalValue(phase.detailsOpenAt, site.timezone),
      // Omitting this dropped the reply date on every save, which then failed
      // phaseConfigSchema and quietly reverted the whole key to defaults.
      rsvpDeadline: fromDateTimeLocalValue(phase.rsvpDeadline, site.timezone),
      dayOfStartAt: fromDateTimeLocalValue(phase.dayOfStartAt, site.timezone),
      thankYouAt: fromDateTimeLocalValue(phase.thankYouAt, site.timezone),
      phaseOverride: phase.phaseOverride,
    };
  }

  // setConfigValue re-validates against the domain schema and, for `phase`,
  // additionally rejects an ordering that would make a phase unreachable.
  const result = await setConfigValue(parsed.data.key, value);
  return result.ok ? jsonOk({ config: result.data }) : jsonError(result.error);
}
