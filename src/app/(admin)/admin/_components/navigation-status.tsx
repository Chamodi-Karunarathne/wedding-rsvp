'use client';

import { useLinkStatus } from 'next/link';

export function NavigationStatus({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="admin-nav-pending" data-pending={pending} role="status">
      {pending && <span className="sr-only">Opening {label}…</span>}
    </span>
  );
}
