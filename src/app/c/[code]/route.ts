import { NextResponse, type NextRequest } from 'next/server';
import { invitationPath } from '@/lib/domain/urls';
import { findGuestByShortCode } from '@/lib/services/guests';

/**
 * PERMANENT, and deliberately NOT under app/(guest).
 *
 * This path is printed on paper and encoded into every QR code. It has to keep
 * working after the guest UI is deleted and rewritten, so it lives outside the
 * disposable route group.
 *
 * Redirects 302 to the canonical /i/[token] so the browser lands on, and
 * bookmarks, the real invitation URL.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await context.params;

  // Normalization happens inside the service: a guest typing "bcd-fgh",
  // "bcdfgh" or "BCD FGH" all resolve, as does an unambiguous lookalike.
  const guest = await findGuestByShortCode(code);

  if (!guest) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.redirect(new URL(invitationPath(guest.token), request.url), 302);
}
