import type { NextResponse } from 'next/server';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { guestDeleteSchema, guestInputSchema, guestUpdateSchema } from '@/lib/api/schemas';
import { createGuest, deleteGuest, updateGuest } from '@/lib/services/guests';

/** PERMANENT. Guest CRUD. Thin: parse, delegate to the service, map the result. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = guestInputSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const result = await createGuest(parsed.data);
  return result.ok ? jsonOk({ guest: result.data }) : jsonError(result.error);
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = guestUpdateSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const { id, ...patch } = parsed.data;
  const result = await updateGuest(id, patch);
  return result.ok ? jsonOk({ guest: result.data }) : jsonError(result.error);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = guestDeleteSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const result = await deleteGuest(parsed.data.id);
  return result.ok ? jsonOk({ deleted: result.data }) : jsonError(result.error);
}
