import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/*
 * Root layout. Lives OUTSIDE the (guest) route group on purpose: deleting
 * src/app/(guest) must not take the root layout with it.
 */

export const metadata: Metadata = {
  title: 'Wedding',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-2xl p-6 leading-relaxed">{children}</body>
    </html>
  );
}
