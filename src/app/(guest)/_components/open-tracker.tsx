'use client';

import { useEffect, useRef } from 'react';
import { createOpenTracking } from '@/lib/domain/open-tracking';
import { sendOpenRequest } from '@/lib/client/open-transport';

/** Record a visible visit, rather than a server render or a prefetched page. */
export function OpenTracker({ token }: { token: string }) {
  const current = useRef<{ token: string; tracker: ReturnType<typeof createOpenTracking> } | null>(null);

  useEffect(() => {
    if (current.current?.token !== token) {
      current.current = { token, tracker: createOpenTracking({
        now: () => Date.now(),
        isVisible: () => document.visibilityState === 'visible',
        isOnline: () => navigator.onLine,
        send: () => sendOpenRequest(token),
        setTimeout: (callback, delay) => window.setTimeout(callback, delay),
        clearTimeout: timer => window.clearTimeout(timer as number),
      }) };
    }
    const tracker = current.current.tracker;
    const pageShown = (event: PageTransitionEvent) => tracker.pageShown(event.persisted);
    tracker.start();
    document.addEventListener('visibilitychange', tracker.visibilityChanged);
    window.addEventListener('pageshow', pageShown);
    window.addEventListener('online', tracker.online);
    return () => {
      tracker.stop();
      document.removeEventListener('visibilitychange', tracker.visibilityChanged);
      window.removeEventListener('pageshow', pageShown);
      window.removeEventListener('online', tracker.online);
    };
  }, [token]);

  return null;
}
