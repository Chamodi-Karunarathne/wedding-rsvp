import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { INVITATION_IMAGE_ID, invitationPreviewName, invitationPreviewNameSize } from '@/lib/domain/og-invitation';
import { scriptOf } from '@/lib/domain/script';
import { loadInvitation } from '@/lib/services/invitation';
import { readCardSvg } from '@/lib/svg';

export const runtime = 'nodejs';
export const alt = 'A personal wedding invitation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** New unfurls receive a new image URL. Already-sent message caches may persist. */
export function generateImageMetadata() {
  return [{ id: INVITATION_IMAGE_ID, alt, size, contentType }];
}

const FONT_FILE = 'CrimsonText-Regular.ttf';
const BACKGROUND_FILE = 'og-invitation-paper.8ea15a301e.jpg';
let cachedFont: Buffer | null | undefined;
let cachedBackground: string | undefined;
let cachedMonogram: string | undefined;

/** A static TTF is required: Satori cannot read the site's variable fonts. */
function displayFont(): Buffer | null {
  if (cachedFont !== undefined) return cachedFont;
  try {
    cachedFont = readFileSync(join(process.cwd(), 'public', 'fonts', FONT_FILE));
  } catch {
    cachedFont = null;
  }
  return cachedFont;
}

/** Reuses the current satin, paper and rose cutouts; JPEG works in Satori. */
function backgroundDataUri(): string {
  return cachedBackground ??= `data:image/jpeg;base64,${readFileSync(join(process.cwd(), 'public', 'card', BACKGROUND_FILE)).toString('base64')}`;
}

function monogramDataUri(): string {
  if (cachedMonogram !== undefined) return cachedMonogram;
  const { viewBox, inner } = readCardSvg('monogram');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;
  return cachedMonogram = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

type Props = { params: Promise<{ token: string }> };

export default async function OpengraphImage({ params }: Props) {
  const { token } = await params;
  const result = await loadInvitation(token);
  const guest = result.ok ? result.data.guest : null;
  const site = result.ok ? result.data.site : null;
  const name = invitationPreviewName(guest);
  const couple = site ? `${site.brideName} & ${site.groomName}` : '';
  const shownCouple = couple !== '' && scriptOf(couple) === 'latin' ? couple : 'A wedding invitation';
  const font = displayFont();

  // The preview contains no event details or admin-only information. A bad
  // token still gets a complete generic image; unsupported scripts keep the
  // same safe generic policy instead of becoming missing-glyph squares.
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', position: 'relative',
          background: '#faf5e9', color: '#5c5348', fontFamily: 'Crimson Text',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori artwork. */}
        <img src={backgroundDataUri()} alt="" width={size.width} height={size.height} style={{ position: 'absolute', inset: 0 }} />
        {/* The same commissioned mark used on the opening, seal and thank-you. */}
        <img src={monogramDataUri()} alt="" width={174} height={116} style={{ position: 'absolute', left: 513, top: 66 }} />

        <div style={{ position: 'absolute', top: 209, left: 250, width: 700, display: 'flex', justifyContent: 'center', color: '#92703c', fontSize: 17, letterSpacing: 4.5 }}>
          YOU ARE INVITED
        </div>
        <div
          style={{
            position: 'absolute', top: 249, left: 204, width: 792, height: 86,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            color: '#846632', fontSize: shownCouple.length > 150 ? 22 : shownCouple.length > 90 ? 27 : shownCouple.length > 50 ? 35 : 48,
            lineHeight: 1.08, textAlign: 'center', wordBreak: 'break-word',
          }}
        >
          {shownCouple}
        </div>
        <div style={{ position: 'absolute', top: 354, left: 557, width: 86, height: 1, background: '#c6ad79', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 377, left: 250, width: 700, display: 'flex', justifyContent: 'center', color: '#8a7658', fontSize: 18, letterSpacing: 1.1 }}>
          {name ? 'An invitation for' : 'With love, for you'}
        </div>
        <div
          style={{
            position: 'absolute', top: 410, left: 221, width: 758, height: 123,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: name ? invitationPreviewNameSize(name) : 36,
            lineHeight: 1.15, textAlign: 'center', wordBreak: 'break-word',
          }}
        >
          {name || 'Please open your personal invitation'}
        </div>
        <div style={{ position: 'absolute', top: 555, left: 250, width: 700, display: 'flex', justifyContent: 'center', color: '#92703c', fontSize: 13, letterSpacing: 2.5 }}>
          TAP TO OPEN YOUR INVITATION
        </div>
      </div>
    ),
    {
      ...size,
      ...(font ? { fonts: [{ name: 'Crimson Text', data: font, weight: 400 as const, style: 'normal' as const }] } : {}),
    },
  );
}
