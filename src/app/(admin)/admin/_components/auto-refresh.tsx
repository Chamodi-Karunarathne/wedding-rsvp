'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { hasPendingAdminWrites } from './api';

const REFRESH_INTERVAL_MS = 30_000;

/** Keep list data current without refreshing over an open editor or request. */
export function AdminAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);

  useEffect(() => { refreshing.current = pending; }, [pending]);

  useEffect(() => {
    if (pathname === '/admin/login') return;
    let lastRefresh = Date.now();

    function refreshIfReady() {
      if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS || refreshing.current ||
          document.visibilityState !== 'visible' || !navigator.onLine || hasPendingAdminWrites()) return;

      // Workflow dialogs live in portals outside main; do not refresh their drafts.
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
        .some(dialog => dialog.getClientRects().length > 0)) return;

      const main = document.getElementById('admin-main');
      if (!main) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && main.contains(active) &&
          active.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (window.getSelection()?.toString()) return;

      // Closed disclosures have no client rects. Visible non-filter forms are
      // editors, including Wedding Details and a selected phone response.
      const editing = Array.from(main.querySelectorAll(
        'form:not(.admin-filters):not(.admin-table-controls), details[open]:not(.admin-table-more), fieldset[data-admin-editing]',
      ))
        .some(element => element.getClientRects().length > 0 &&
          (element.tagName === 'FORM' || element.hasAttribute('data-admin-editing') ||
            element.querySelector('input, textarea, select')));
      if (editing) return;

      lastRefresh = Date.now();
      refreshing.current = true;
      startTransition(() => router.refresh());
    }

    const timer = window.setInterval(refreshIfReady, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfReady);
    window.addEventListener('focus', refreshIfReady);
    window.addEventListener('online', refreshIfReady);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfReady);
      window.removeEventListener('focus', refreshIfReady);
      window.removeEventListener('online', refreshIfReady);
    };
  }, [pathname, router]);

  return null;
}
