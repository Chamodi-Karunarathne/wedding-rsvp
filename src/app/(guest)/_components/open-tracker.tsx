'use client';

import { useEffect, useRef } from 'react';

/** Record a visible visit, rather than a server render or a prefetched page. */
export function OpenTracker({ token }: { token: string }) {
  const attemptedToken = useRef<string | null>(null);

  useEffect(() => {
    const record = () => {
      if (document.visibilityState !== 'visible' || attemptedToken.current === token) return;
      attemptedToken.current = token;
      // Tracking must never interrupt the invitation, animation, or reply flow.
      void fetch('/api/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {});
    };

    record();
    document.addEventListener('visibilitychange', record);
    return () => document.removeEventListener('visibilitychange', record);
  }, [token]);

  return null;
}
