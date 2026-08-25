import { ImageResponse } from 'next/og';

/*
 * DISPOSABLE PLACEHOLDER - DO NOT LET THIS REACH A REAL GUEST.
 *
 * WhatsApp caches link previews more or less permanently. The first image any
 * real guest's phone fetches for a given URL is the one they will keep seeing
 * forever - re-deploying a better image later does NOT replace it for anyone
 * who has already received the link. There is no reliable way to bust that
 * cache for a message already sent.
 *
 * So: this route exists only so the plumbing is in place. Replace it with the
 * real artwork BEFORE the first invitation is sent to anybody, including
 * yourselves in a test group chat.
 *
 * The output is deliberately ugly and says so in large type, because a quiet,
 * plausible-looking placeholder is exactly the one that slips through.
 */

export const runtime = 'nodejs';
export const alt = 'Placeholder - not the final invitation image';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fde68a',
          border: '16px solid #b91c1c',
          fontFamily: 'sans-serif',
          textAlign: 'center',
          padding: 60,
        }}
      >
        <div style={{ fontSize: 76, fontWeight: 700, color: '#b91c1c' }}>PLACEHOLDER</div>
        <div style={{ fontSize: 40, marginTop: 20, color: '#7f1d1d' }}>
          Not the final invitation image
        </div>
        <div style={{ fontSize: 26, marginTop: 30, color: '#78350f', lineHeight: 1.4 }}>
          Replace before sending to anyone. WhatsApp caches this permanently.
        </div>
      </div>
    ),
    size,
  );
}
