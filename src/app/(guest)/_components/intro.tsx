'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SKIP_VISIBLE_AT } from '@/lib/animation/beats';
import { seenStorageKey, shouldPlayIntro } from '@/lib/animation/playback';

/*
 * The intro sequence, as a layer over a page that already works.
 *
 * THE OVERLAY IS `hidden` IN THE SERVER HTML and only ever revealed by this
 * component deciding to play. That is the whole progressive-enhancement
 * story: no JavaScript, a script that failed to load, a thrown error, an old
 * browser, ?noanim=1 - in every one of those the overlay stays hidden and the
 * invitation underneath is complete, readable and submittable.
 *
 * GSAP is imported dynamically so its ~70 KB is not in the critical path for
 * a guest who is never going to see the sequence.
 */

type Props = {
  token: string;
  /** Server-rendered monogram, envelope and seal. */
  children: ReactNode;
  /** Copy, passed in rather than imported: this is a Client Component. */
  labels: { skip: string; replay: string };
};

type Phase = 'deciding' | 'playing' | 'finished';

/**
 * The card is lifted out of the page and centred for beats 4 to 9, then put
 * back. Staging is a class, applied once and removed once - never an animated
 * property - so nothing here transitions layout.
 */
function stageCard(on: boolean): void {
  const card = document.querySelector<HTMLElement>('[data-intro="card"]');
  card?.classList.toggle('is-staged', on);
  document.documentElement.classList.toggle('intro-locked', on);
}

export function Intro({ token, children, labels }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<Phase>('deciding');
  const [skipVisible, setSkipVisible] = useState(false);
  const [canReplay, setCanReplay] = useState(false);

  /** Reveals the invitation and tears the sequence down. Idempotent. */
  const finish = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    // Back into the page, and scrolling again. Done before the styles are
    // cleared so the card never flashes fixed-and-visible in the flow.
    stageCard(false);

    // Anything the timeline left mid-animation is reset, so a skip lands on
    // the finished invitation rather than on a half-played one.
    document.querySelectorAll<HTMLElement>('[data-intro-managed]').forEach((element) => {
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
      element.style.removeProperty('clip-path');
    });

    setPhase('finished');
    setSkipVisible(false);
    setCanReplay(true);

    try {
      localStorage.setItem(seenStorageKey(token), '1');
    } catch {
      // Private mode, or storage disabled. Costs a replay on the next visit
      // and nothing else, so it is not worth surfacing.
    }
  }, [token]);

  const play = useCallback(
    async (replayRequested: boolean) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      let alreadySeen = false;
      try {
        alreadySeen = localStorage.getItem(seenStorageKey(token)) === '1';
      } catch {
        alreadySeen = false;
      }

      const params = new URLSearchParams(window.location.search);
      const decision = shouldPlayIntro({
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        noanim: params.get('noanim') === '1',
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory,
        alreadySeen,
        replayRequested,
      });

      if (!decision.play) {
        setPhase('finished');
        setCanReplay(decision.reason === 'already-seen');
        return;
      }

      // Hide what the sequence is about to reveal. Done HERE, in script,
      // never in CSS: if this code never runs, nothing was ever hidden.
      const card = document.querySelector<HTMLElement>('[data-intro="card"]');
      const managed = [card].filter((el): el is HTMLElement => el !== null);
      for (const element of managed) {
        element.dataset.introManaged = '';
        element.style.opacity = '0';
      }

      // The sequence always opens at the top of the page, whatever the
      // browser restored on a back-navigation.
      window.scrollTo(0, 0);
      stageCard(true);

      setPhase('playing');
      overlay.hidden = false;

      try {
        // Dynamic, so GSAP is a separate chunk fetched only when the
        // sequence actually plays. A guest on reduced-motion, a low-end
        // phone, or a second visit never downloads it.
        const { buildIntroTimeline } = await import('@/lib/animation/timeline');
        const { timeline, cleanup } = buildIntroTimeline(document, finish);
        cleanupRef.current = cleanup;
        timeline.play();
      } catch {
        // A broken sequence must never cost anybody their invitation.
        finish();
      }
    },
    [finish, token],
  );

  useEffect(() => {
    void play(false);
    return () => {
      cleanupRef.current?.();
      // Navigating away mid-sequence must not leave the page unscrollable.
      stageCard(false);
    };
  }, [play]);

  // The skip control appears early and never moves after that.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = window.setTimeout(() => setSkipVisible(true), SKIP_VISIBLE_AT * 1000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Escape does what the button does, for anyone on a keyboard.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, finish]);

  return (
    <>
      <div
        ref={overlayRef}
        className="intro"
        hidden
        // The invitation underneath is the real content; this is scenery.
        aria-hidden="true"
        data-phase={phase}
      >
        <div className="intro-veil" />
        <div className="intro-stage">{children}</div>
        <canvas className="intro-canvas" data-intro="canvas" />
      </div>

      {phase === 'playing' && (
        <button
          type="button"
          className="intro-skip"
          data-visible={skipVisible ? 'true' : 'false'}
          onClick={finish}
        >
          {labels.skip}
        </button>
      )}

      {phase === 'finished' && canReplay && (
        <p className="mt-6 text-center">
          <button type="button" className="replay" onClick={() => void play(true)}>
            {labels.replay}
          </button>
        </p>
      )}
    </>
  );
}
