import type { ReactNode } from 'react';
import { Noto_Serif_Sinhala } from 'next/font/google';
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
const notoSerifSinhala = Noto_Serif_Sinhala({
  subsets: ['sinhala'],
  weight: ['400', '600'],
  variable: '--font-sinhala',
  display: 'swap',
  preload: false,
});

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${notoSerifSinhala.variable} guest-ground`}>
      {/*
        Scenery. Referenced with <img> rather than inlined, unlike the card
        artwork: nothing animates inside these, so they can be a cached request
        instead of bytes in every HTML response. Decorative, so alt="".
      */}
      <div className="page-floral" data-corner="top-left" aria-hidden="true">
        <img src={cardAsset('floral-corner.svg')} alt="" width={200} height={200} />
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
