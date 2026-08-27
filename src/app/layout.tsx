import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Noto_Serif, Public_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';

const publicSansHeading = Public_Sans({ subsets: ['latin'], variable: '--font-heading' });

const notoSerif = Noto_Serif({ subsets: ['latin'], variable: '--font-serif' });

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
    <html lang="en" className={cn('font-serif', notoSerif.variable, publicSansHeading.variable)}>
      <body className="leading-relaxed">{children}</body>
    </html>
  );
}
