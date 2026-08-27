import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

/*
 * Semi-permanent. Allowed to stay ugly.
 *
 * Unlike app/(guest), this is not expected to be thrown away, so it may import
 * services freely - but it still never touches the data layer directly.
 */

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const LINKS = [
  ['/admin', 'Dashboard'],
  ['/admin/guests', 'Guests'],
  ['/admin/send', 'Send'],
  ['/admin/rsvps', 'RSVPs'],
  ['/admin/config', 'Config'],
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="mb-6 border-b pb-2 text-sm">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="mr-3 underline">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
