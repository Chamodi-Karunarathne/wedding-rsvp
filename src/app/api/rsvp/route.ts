import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { limitPublicRequest, limitRsvpToken } from '@/lib/api/public-limits';
import { rsvpRequestSchema } from '@/lib/api/schemas';
import { submitRsvpByToken } from '@/lib/services/rsvps';

/**
 * PERMANENT. A thin HTTP shell over the RSVP service - parse, delegate, map.
 * No business rules live here.
 *
 *   404  unknown token
 *   403  guest not invited to one of the given events
 *   400  validation failure, naming the field and why
 *
 * The service writes every response in a single transaction.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const limited = await limitPublicRequest(request, 'rsvp');
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = rsvpRequestSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const { token, responses, message } = parsed.data;
  const tokenLimited = await limitRsvpToken(token);
  if (tokenLimited) return tokenLimited;

  const result = await submitRsvpByToken(token, {
    responses,
    // `message` absent means "leave it alone", so only forward it when present.
    ...(message !== undefined && { message }),
    source: 'self',
  });

  if (!result.ok) return jsonError(result.error);

  return jsonOk({ responses: result.data });
}
