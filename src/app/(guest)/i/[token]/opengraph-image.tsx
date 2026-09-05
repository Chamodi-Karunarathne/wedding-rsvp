import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { scriptOf } from '@/lib/domain/script';
import { loadInvitation } from '@/lib/services/invitation';
import { readCardSvg } from '@/lib/svg';

/*
 * PROVISIONAL - DO NOT LET THIS REACH A REAL GUEST.
 *
 * WhatsApp caches link previews more or less permanently. The first image any
 * real guest's phone fetches for a given URL is the one they will keep seeing
 * forever - re-deploying a better image later does NOT replace it for anyone
 * who has already received the link. There is no reliable way to bust that
 * cache for a message already sent.
 *
 * It is now the real envelope artwork with the guest's name and the wax seal,
 * rather than the placeholder slab it was, because it is the first thing all
 * five hundred of them will see. It still has not been signed off. Keep this
 * comment until it has been.
 */

export const runtime = 'nodejs';
export const alt = 'A wedding invitation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const GOLD = '#b18906';
const INK = '#6d6e71';
const PAPER = '#fffdf8';

const ENVELOPE_WIDTH = 760;
/** envelope.svg is 656.52 x 497.75. */
const ENVELOPE_HEIGHT = Math.round((ENVELOPE_WIDTH * 497.75) / 656.52);
const SEAL_SIZE = 132;

/**
 * The artwork, as a data URI.
 *
 * Satori draws <img> reliably and its own SVG element support is partial - an
 * inline <polygon> came out as a filled rectangle, which is how the envelope
 * flap disappeared in the first version of this image. Handing it the real
 * file as an image sidesteps that entirely AND means the preview is the
 * actual artwork rather than an approximation of it that can drift.
 */
/**
 * The face the name is set in.
 *
 * Satori has no access to next/font, so without this the guest's name came out
 * in whatever sans-serif the renderer defaults to - the one element of the
 * preview that is about a specific household, set in a face that appears
 * nowhere else on the invitation. Crimson Text is vendored under its OFL
 * licence in public/fonts.
 *
 * A STATIC instance, not a variable font. Satori's parser cannot read one:
 * handed the variable Cormorant Garamond it threw "Cannot read properties of
 * undefined (reading '256')" and the route 500'd, which for an OG image means
 * a link with no preview at all.
 *
 * Read once at module scope: this file is fetched by a link unfurler, and
 * re-reading it per request to render an image that is then cached forever
 * would be work done for nobody.
 */
let cachedFont: Buffer | null | undefined;

/**
 * Read on first use, not at module scope, and never fatal.
 *
 * Module-scope I/O in a route file runs whenever anything loads the module -
 * including route collection, which Next does in a worker pool. A throw there
 * kills the worker rather than the request, and surfaces as "Jest worker
 * encountered N child process exceptions", which names neither the file nor
 * the cause. Nothing in a route module should be able to do that before a
 * request has even arrived.
 *
 * A missing font costs the preview its serif. Throwing costs it the preview.
 */
function displayFont(): Buffer | null {
  if (cachedFont !== undefined) return cachedFont;
  try {
    cachedFont = readFileSync(join(process.cwd(), 'public', 'fonts', FONT_FILE));
  } catch {
    cachedFont = null;
  }
  return cachedFont;
}

const FONT_FILE = 'CrimsonText-Regular.ttf';

/**
 * The palette, applied to the artwork itself.
 *
 * On the site the exports are inlined and CSS paints them - Satori never sees
 * that stylesheet, so the preview was showing the raw Illustrator drawing:
 * white paper, near-black hairlines. The first thing five hundred households
 * see would have been a wireframe of the envelope they get on the page in
 * cream and gold. Substituted into the source here so the two agree, with the
 * same values guest.css uses.
 */
const ARTWORK_PALETTE: [RegExp, string][] = [
  [/#231f20/gi, 'rgba(177,137,6,0.55)'], // hairlines -> gold
  [/#fef3f8/gi, '#f7dfe6'], // lining -> blush
  [/#fff(?![0-9a-f])/gi, '#fdf6ea'], // paper -> warm cream
];

function artworkDataUri(name: string): string {
  const { viewBox, inner } = readCardSvg(name);
  const painted = ARTWORK_PALETTE.reduce(
    (source, [pattern, colour]) => source.replace(pattern, colour),
    inner,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${painted}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

type Props = { params: Promise<{ token: string }> };

export default async function OpengraphImage({ params }: Props) {
  const { token } = await params;
  const result = await loadInvitation(token);

  // A bad token still gets an image: WhatsApp caches whatever it is handed,
  // and a broken preview is worse than a generic one.
  const guest = result.ok ? result.data.guest : null;
  const site = result.ok ? result.data.site : null;
  const name = guest?.cardName ?? '';

  /*
   * Satori has no font fallback chain, so a Sinhala name in a Latin face
   * renders as tofu here exactly as it would on the envelope. Non-Latin names
   * fall back to the couple's names rather than to boxes - a preview that
   * says less is better than one that looks broken.
   */
  const nameIsLatin = name !== '' && scriptOf(name) === 'latin';
  const shown = nameIsLatin ? name : `${site?.brideName ?? ''} & ${site?.groomName ?? ''}`;
  const font = displayFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: PAPER,
          fontFamily: 'Crimson Text',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: ENVELOPE_WIDTH,
            height: ENVELOPE_HEIGHT,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori, not the browser. */}
          <img
            src={artworkDataUri('envelope')}
            alt=""
            width={ENVELOPE_WIDTH}
            height={ENVELOPE_HEIGHT}
          />

          {/* The seal, sitting where the flap meets the face. */}
          <img
            src={artworkDataUri('seal')}
            alt=""
            width={SEAL_SIZE}
            height={SEAL_SIZE}
            style={{
              position: 'absolute',
              left: (ENVELOPE_WIDTH - SEAL_SIZE) / 2,
              top: ENVELOPE_HEIGHT * 0.62 - SEAL_SIZE / 2,
            }}
          />

          {/* The name, written on the face below the flap. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: ENVELOPE_HEIGHT * 0.74,
              width: ENVELOPE_WIDTH,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 56px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: shown.length > 26 ? 34 : 46,
                color: INK,
                lineHeight: 1.2,
              }}
            >
              {shown}
            </div>
            <div style={{ marginTop: 14, fontSize: 19, color: GOLD, letterSpacing: 6 }}>
              YOU ARE INVITED
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // Omitted entirely when the file could not be read, rather than passed
      // as null: satori validates this list before it renders anything.
      ...(font ? { fonts: [{ name: 'Crimson Text', data: font, weight: 400 as const, style: 'normal' as const }] } : {}),
    },
  );
}
