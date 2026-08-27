import type { ReactNode } from 'react';

/*
 * DISPOSABLE, like the rest of this route group.
 *
 * Holds nothing but the narrow reading column the guest pages want. It used
 * to live on <body> in the root layout, which also constrained the admin
 * console; it moved here so the two can differ without the guest UI changing
 * at all.
 */

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl p-6">{children}</div>;
}
