import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionCookie } from '@/lib/auth';

/**
 * PERMANENT. Gate on /admin/* and /api/admin/*.
 *
 * Runs on the Edge runtime, which is why lib/auth.ts uses Web Crypto rather
 * than node:crypto. The noindex header is set globally in next.config.ts
 * instead of here, so it also covers responses middleware does not see.
 */

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/login', '/api/admin/logout']);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionCookie(cookie)) return NextResponse.next();

  // API callers get a status they can act on; humans get sent to the form.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: { code: 'forbidden', message: 'Not signed in.' } },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  if (pathname !== '/admin') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
