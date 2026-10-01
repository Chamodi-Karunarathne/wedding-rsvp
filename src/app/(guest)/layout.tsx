import type { CSSProperties, ReactNode } from 'react';
import { cardAsset } from '@/lib/domain/card-assets';
import { Noto_Serif_Sinhala } from 'next/font/google';
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
 * Only the Sinhala face is loaded here. Cormorant Garamond and Jost - the two
 * the invitation is actually set in - moved to the root layout, because
 * not-found.tsx is guest-facing but deliberately lives outside this route
 * group and was being left in a system serif.
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
    <div className={`${notoSerifSinhala.variable} guest-ground`} style={{ '--paper-texture': `url("${cardAsset('paper-grain.svg')}")` } as CSSProperties}>
      <div className="guest-content mx-auto max-w-5xl">{children}</div>
    </div>
  );
}
