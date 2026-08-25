import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, readJson, zodError } from '@/lib/api/respond';
import { createSessionCookie, SESSION_COOKIE, SESSION_TTL_MS, verifyAdminPassword } from '@/lib/auth';

/**
 * PERMANENT. Exchanges the shared password for a signed session cookie.
 *
 * Exempt from the middleware gate, for obvious reasons. Runs on Node so the
 * password never touches an Edge log; the comparison itself is constant-time.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ password: z.string().min(1).max(500) });

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  if (!(await verifyAdminPassword(parsed.data.password))) {
    // Deliberately vague, and identical for every failure.
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Incorrect password.' } },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
