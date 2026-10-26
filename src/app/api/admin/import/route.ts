import type { NextResponse } from 'next/server';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/api/guard';
import { csvImportSchema } from '@/lib/api/schemas';
import { importGuestsCsv } from '@/lib/services/import';

/**
 * PERMANENT. CSV guest import.
 *
 * Always returns 200 when the file itself was readable, even if individual
 * rows failed - the per-row results are the payload. A 4xx here would mean
 * "the request was malformed", not "row 37 had a bad side value".
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = csvImportSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const result = await importGuestsCsv(parsed.data.csv, {
      ...(parsed.data.defaultEventSlugs && { defaultEventSlugs: parsed.data.defaultEventSlugs }),
      ...(parsed.data.dryRun !== undefined && { dryRun: parsed.data.dryRun }),
      ...(parsed.data.decisions && { decisions: parsed.data.decisions }),
    });

    return result.ok
      ? jsonOk({ summary: result.data }, { headers: { 'cache-control': 'no-store' } })
      : jsonError(result.error);
  } catch {
    // Database errors can contain connection details and guest parameters.
    // Apply uses one transaction; a dropped commit response can still leave
    // the caller uncertain, so ask them to review the list before retrying.
    console.error('Guest import could not complete.');
    return jsonError({
      code: 'internal',
      message: parsed.data.dryRun
        ? 'The guest list could not be checked. Please try again.'
        : 'The import could not finish. Some rows may have been saved. Check the guest list, then check your CSV again before retrying.',
    });
  }
}
