'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * One item in the admin nav, highlighted when it is the page you are on.
 *
 * A client component purely for usePathname. /admin is matched exactly -
 * a prefix match would light up Dashboard on every page in the console.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === '/admin' ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </Link>
  );
}
