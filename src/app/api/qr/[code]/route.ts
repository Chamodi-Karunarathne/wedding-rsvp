import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { isValidShortCode, normalizeShortCode } from '@/lib/domain/ids';
import { shortCodeUrl } from '@/lib/domain/urls';

/**
 * PERMANENT. QR code as SVG, for the printed invitation cards.
 *
 * The QR encodes {NEXT_PUBLIC_SITE_URL}/c/{SHORT_CODE} - the same short code
 * printed as text beside it, so scanning and typing lead to the same place,
 * and the payload stays short enough to survive being printed small.
 *
 * ONCE CARDS ARE PRINTED THIS PAYLOAD CANNOT CHANGE. NEXT_PUBLIC_SITE_URL must
 * be the final production origin before anything goes to the printer.
 *
 * Requested as /api/qr/ABC123.svg. App Router dynamic segments cannot carry a
 * literal suffix, so the .svg is stripped from the parameter here.
 */

export const runtime = 'nodejs';

// Error correction M tolerates a moderate amount of print smudging while
// keeping the module count low enough to scan from a card.
const QR_OPTIONS = {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 512,
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const raw = (await context.params).code.replace(/\.svg$/i, '');
  const code = normalizeShortCode(raw);

  if (!isValidShortCode(code)) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // Deliberately not checked against the database: the print run is generated
  // before some guests exist, and a QR for an unknown code simply lands on the
  // 404 that /c/[code] already returns.
  const svg = await QRCode.toString(shortCodeUrl(code), QR_OPTIONS);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Deterministic output for a given code, so it can cache hard.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
