import type { ReactNode } from 'react';
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
const notoSerifSinhala = Noto_Serif_Sinhala({
  subsets: ['sinhala'],
  weight: ['400', '600'],
  variable: '--font-sinhala',
  display: 'swap',
  preload: false,
});

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <div className={`${notoSerifSinhala.variable} mx-auto max-w-2xl p-6`}>{children}</div>;
}
