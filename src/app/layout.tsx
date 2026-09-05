import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Cormorant_Garamond, Jost, Noto_Serif, Public_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';

const publicSansHeading = Public_Sans({ subsets: ['latin'], variable: '--font-heading' });

const notoSerif = Noto_Serif({ subsets: ['latin'], variable: '--font-serif' });

/*
 * The invitation's two faces, loaded HERE rather than in (guest)/layout.tsx.
 *
 * not-found.tsx is guest-facing - it is what an unknown or mistyped token
 * reaches - but it lives outside the (guest) route group on purpose, so that
 * deleting the guest UI does not delete the 404. Loading these in the guest
 * layout left that one page set in a system serif while every other page a
 * guest can reach was not. The admin console does not reference either
 * variable, so nothing there changes.
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

/*
 * Root layout. Lives OUTSIDE the (guest) route group on purpose: deleting
 * src/app/(guest) must not take the root layout with it.
 *
 * The body deliberately sets no width. The guest pages are a narrow column
 * and set that themselves in (guest)/layout.tsx; the admin console is full of
 * tables and needs the room. Constraining both from here meant the admin
 * tables were reading at half the width of the screen.
 */

export const metadata: Metadata = {
  title: 'Wedding',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(
        'font-serif',
        notoSerif.variable,
        publicSansHeading.variable,
        cormorant.variable,
        jost.variable,
      )}
    >
      <body className="leading-relaxed">{children}</body>
    </html>
  );
}
