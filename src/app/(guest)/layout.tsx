import type { ReactNode } from 'react';
import { Cormorant_Garamond, Jost, Noto_Serif_Sinhala } from 'next/font/google';
import { cardAsset } from '@/lib/domain/card-assets';
import './guest.css';

/*
 * DISPOSABLE, like the rest of this route group.
 *
 * Holds the narrow reading column the guest pages want, the guest stylesheet,
 * and the Sinhala face. It used to live on <body> in the root layout, which
 * also constrained the admin console; it moved here so the two can differ.
 */

/*
 * preload: false on purpose. Most households are addressed in Latin script
 * and will never use this face, so it is fetched only when a name actually
 * selects it - see lib/domain/script.ts. Preloading it would cost every guest
 * a font they do not need on a Colombo mobile connection.
 */
/*
 * The two faces the invitation is set in.
 *
 * Cormorant Garamond for anything that reads as the invitation speaking - the
 * couple, the headings, the card's own control. It is a light old-style serif
 * that sits beside the copperplate of the printed card instead of arguing
 * with it, where the previous Noto Serif read as a system default.
 *
 * Jost for the reply form. A form set in a display serif is a form that is
 * harder to fill in, and this is the one part of the page where being easy to
 * read at 14px on a phone in a hotel lobby matters more than being pretty.
 * Both are preloaded: unlike the Sinhala face, every guest uses these.
 */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-body',
  display: 'swap',
});

const notoSerifSinhala = Noto_Serif_Sinhala({
  subsets: ['sinhala'],
  weight: ['400', '600'],
  variable: '--font-sinhala',
  display: 'swap',
  preload: false,
});

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${cormorant.variable} ${jost.variable} ${notoSerifSinhala.variable} guest-ground`}
    >
      {/*
        Scenery. Referenced with <img> rather than inlined, unlike the card
        artwork: nothing animates inside these, so they can be a cached request
        instead of bytes in every HTML response. Decorative, so alt="".
      */}
      <div className="page-floral" data-corner="top-left" aria-hidden="true">
        <img src={cardAsset('floral-corner.svg')} alt="" width={200} height={200} />
      </div>
      {/* Long arching branches down the two edges, behind everything. */}
      <div className="page-bough" data-edge="left" aria-hidden="true">
        <img src={cardAsset('floral-bough.svg')} alt="" width={320} height={900} />
      </div>
      <div className="page-bough" data-edge="right" aria-hidden="true">
        <img src={cardAsset('floral-bough.svg')} alt="" width={320} height={900} />
      </div>

      <div className="page-floral" data-corner="bottom-right" aria-hidden="true">
        <img src={cardAsset('floral-corner.svg')} alt="" width={200} height={200} />
      </div>

      {/*
        Wider than a reading column, because the card is the hero and gets the
        room. Text inside caps its own measure - .legible is 34rem - so
        nothing ends up set across the full width.
      */}
      <div className="guest-content mx-auto max-w-5xl px-5 py-8 sm:px-6">{children}</div>
    </div>
  );
}
