import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionCookie } from '@/lib/auth';

/**
 * PERMANENT. The admin check, applied inside each handler.
 *
 * src/proxy.ts already gates /api/admin/*, and it works - this is deliberately
 * a second lock on the same door. The proxy protects by URL pattern, so a typo
 * in its matcher, a route moved out from under it, or a future Next change to
 * how the proxy is invoked would silently expose every one of these endpoints,
 * and /api/admin/export hands back the entire guest list in one request. A
 * mistake in a matcher should cost a 401, not five hundred households.
 *
 * Kept out of lib/auth.ts because that module is imported by the proxy, and
 * next/headers has no business in the proxy's import graph.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  if (await verifySessionCookie(store.get(SESSION_COOKIE)?.value)) return null;

  // 401, matching what the proxy returns, so a caller cannot tell which of the
  // two locks turned them away.
  return NextResponse.json(
    { ok: false, error: { code: 'forbidden', message: 'Not signed in.' } },
    { status: 401 },
  );
}

/** True when the request carries a valid admin session. */
export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE)?.value);
}
