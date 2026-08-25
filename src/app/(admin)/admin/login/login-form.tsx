'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '../_components/api';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await postJson('/api/admin/login', { password });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <div>
        <label className="block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border px-2 py-1"
          required
        />
      </div>
      <button type="submit" disabled={busy} className="border px-4 py-2 disabled:opacity-50">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
