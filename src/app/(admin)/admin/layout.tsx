import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { NavLink } from './_components/nav-link';

/*
 * Semi-permanent.
 *
 * Unlike app/(guest), this is not expected to be thrown away, so it may import
 * services freely - but it still never touches the data layer directly.
 *
 * Presentation is shadcn/ui throughout. The console is used by three people
 * under time pressure in November, most often on a phone, so it is worth the
 * components being legible; nothing here encodes a decision about the guest
 * UI, which is still disposable and still unstyled.
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="font-heading text-sm font-semibold tracking-tight">Wedding admin</span>
          <nav className="flex flex-wrap items-center gap-1">
            {LINKS.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
