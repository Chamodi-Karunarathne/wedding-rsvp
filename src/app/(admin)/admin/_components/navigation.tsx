'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  RiHeartLine,
  RiHome4Line,
  RiGroupLine,
  RiMailLine,
  RiChat3Line,
  RiSettings3Line,
  RiMenuLine,
  RiCloseLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { postJson } from './api';
import { NavigationStatus } from './navigation-status';

const links = [
  { href: '/admin', label: 'Overview', icon: RiHome4Line },
  { href: '/admin/guests', label: 'Guests', icon: RiGroupLine },
  { href: '/admin/send', label: 'Invitations', icon: RiMailLine },
  { href: '/admin/rsvps', label: 'Responses', icon: RiChat3Line },
  { href: '/admin/config', label: 'Wedding Details', icon: RiSettings3Line },
];
export function AdminNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = pathname === '/admin/login';
  async function signOut() {
    setBusy(true);
    const result = await postJson('/api/admin/logout', {});
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace('/admin/login');
    router.refresh();
  }
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-inner">
        <Link href={login ? '/admin/login' : '/admin'} className="admin-brand">
          <span className="admin-brand-mark">
            <RiHeartLine size={21} aria-hidden="true" />
          </span>
          <span>
            <strong>Our wedding</strong>
            <small>Private family dashboard</small>
          </span>
        </Link>
        {!login && (
          <>
            <Button
              type="button"
              variant="outline"
              className="admin-menu-button"
              aria-expanded={open}
              aria-controls="admin-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <RiCloseLine aria-hidden="true" /> : <RiMenuLine aria-hidden="true" />}
              {open ? 'Close' : 'Menu'}
            </Button>
            <nav
              id="admin-navigation"
              aria-label="Wedding management"
              className="admin-navigation"
              data-open={open}
            >
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={
                    (href === '/admin' ? pathname === href : pathname.startsWith(href))
                      ? 'page'
                      : undefined
                  }
                  className="admin-nav-link"
                  onClick={() => setOpen(false)}
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                  <NavigationStatus label={label} />
                </Link>
              ))}
              <Button type="button" variant="ghost" onClick={signOut} disabled={busy}>
                {busy ? 'Signing out…' : 'Sign out'}
              </Button>
            </nav>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </header>
  );
}
