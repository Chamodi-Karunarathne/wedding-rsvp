import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AdminNavigation } from './_components/navigation';
import { AdminAutoRefresh } from './_components/auto-refresh';
import './admin.css';

export const metadata: Metadata = {
  title: 'Our wedding · Family dashboard',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <AdminNavigation />
      <AdminAutoRefresh />
      <main id="admin-main">{children}</main>
    </div>
  );
}
