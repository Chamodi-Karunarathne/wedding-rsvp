import type { NextResponse } from 'next/server';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/api/guard';
import { deliveryChannelDeleteSchema, deliveryChannelSchema } from '@/lib/api/schemas';
import { removeDeliveryChannel, setDeliveryChannel } from '@/lib/services/guests';

/** PERMANENT. Mark-as-sent for the send list. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = deliveryChannelSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const { guestId, channel, status, sentBy, notes } = parsed.data;

  const result = await setDeliveryChannel(guestId, channel, {
    status,
    ...(sentBy !== undefined && { sentBy }),
    ...(notes !== undefined && { notes }),
  });

  return result.ok ? jsonOk({ channel: result.data }) : jsonError(result.error);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);
  const parsed = deliveryChannelDeleteSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  const result = await removeDeliveryChannel(parsed.data.guestId, parsed.data.channel);
  return result.ok ? jsonOk({ removed: result.data }) : jsonError(result.error);
}
