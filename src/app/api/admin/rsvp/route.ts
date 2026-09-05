import type { NextResponse } from 'next/server';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/api/guard';
import { proxyRsvpSchema } from '@/lib/api/schemas';
import { submitRsvpByGuestId } from '@/lib/services/rsvps';

/**
 * PERMANENT. Proxy RSVP - recording a response on a guest's behalf.
 *
 * Goes through the same service, and therefore the same invariants, as a
 * guest's own submission. The only differences are `source` and `recordedBy`,
 * which is what makes it possible to tell later how an answer arrived. Since
 * all three admins share one password there is no identity to infer, so
 * recordedBy is required from the form rather than derived.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = proxyRsvpSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const { guestId, responses, message, recordedBy, source } = parsed.data;

  const result = await submitRsvpByGuestId(guestId, {
    responses,
    ...(message !== undefined && { message }),
    source,
    recordedBy,
  });

  return result.ok ? jsonOk({ responses: result.data }) : jsonError(result.error);
}
