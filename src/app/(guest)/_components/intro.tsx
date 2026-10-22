'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SEQUENCE_DURATION } from '@/lib/animation/beats';
import { seenStorageKey, shouldPlayIntro } from '@/lib/animation/playback';

/*
 * The intro sequence, as a layer over a page that already works.
 *
 * THE OVERLAY IS `hidden` IN THE SERVER HTML and only ever revealed by this
 * component deciding to play. That is the whole progressive-enhancement
 * story: no JavaScript, a script that failed to load, a thrown error, an old
 * browser - in every one of those the overlay stays hidden and the
 * invitation details and telephone contacts remain readable.
 *
 * GSAP is imported dynamically so its ~70 KB is not in the critical path for
 * a guest who is never going to see the sequence.
 */

type Props = {
  token: string;
  /** Server-rendered monogram, envelope and seal. */
  children: ReactNode;
  /** Copy, passed in rather than imported: this is a Client Component. */
  labels: { replay: string };
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
  const main = document.querySelector('main');
  if (main) main.inert = on;
}

export function Intro({ token, children, labels }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const runRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('deciding');
  const [canReplay, setCanReplay] = useState(false);

  /** Reveals the invitation and tears the sequence down. Idempotent. */
  const finish = useCallback(() => {
    runRef.current += 1;
    cleanupRef.current?.();
    cleanupRef.current = null;

    // play() reveals the overlay imperatively, so completion hides it the same
    // way before React catches up with the finished phase.
    if (overlayRef.current) overlayRef.current.hidden = true;

    // Back into the page, and scrolling again. Done before the styles are
    // cleared so the card never flashes fixed-and-visible in the flow.
    stageCard(false);

    // Also restore the usable invitation after an animation load failure.
    document.querySelectorAll<HTMLElement>('[data-intro-managed]').forEach((element) => {
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
      element.style.removeProperty('clip-path');
    });

    setPhase('finished');
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
      const run = ++runRef.current;
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
      /*
       * The sweep is managed too, so finish() clears what the timeline left on
       * it. Beat 9 ends with it translated to xPercent: 120 and only its
       * opacity zeroed - the transform stayed, and a 100%-wide element pushed
       * that far right made the finished page 1085px wide on a 524px screen.
       * A horizontal scrollbar on the invitation, caused by an invisible
       * decoration.
       */
      const sweep = document.querySelector<HTMLElement>('[data-intro="sweep"]');
      const managed = [card, sweep].filter((el): el is HTMLElement => el !== null);
      for (const element of managed) {
        element.dataset.introManaged = '';
        element.style.opacity = '0';
      }

      // The sequence always opens at the top of the page, whatever the
      // browser restored on a back-navigation.
      window.scrollTo(0, 0);
      stageCard(true);

      setPhase('playing');

      /*
       * The overlay is revealed here, imperatively, AND kept revealed by
       * `hidden={phase !== 'playing'}` in the markup below.
       *
       * Both, on purpose. The attribute is what React owns, so a re-render
       * cannot quietly put the overlay back. The imperative set makes it visible NOW,
       * before the timeline is built: GSAP measures the artwork with getBBox()
       * to work out where the seal halves turn about, and an element inside a
       * `hidden` subtree measures zero on every axis.
       */
      overlay.hidden = false;

      try {
        // Dynamic, so GSAP is a separate chunk fetched only when the
        // sequence actually plays. A guest on reduced-motion, a low-end
        // phone, or a second visit never downloads it.
        const { buildIntroTimeline } = await import('@/lib/animation/timeline');
        if (run !== runRef.current || !overlay.isConnected) return;
        const { timeline, cleanup } = buildIntroTimeline(document, finish, () => stageCard(false));
        cleanupRef.current = cleanup;

        /*
         * A handle on the timeline while developing, so a beat can be inspected
         * at rest instead of caught mid-flight:
         *
         *   __intro.seek(10.5)   the moment the florals finish blooming
         *   __intro.pause()
         *
         * Stripped from production builds by the constant folding on
         * NODE_ENV, so nothing reaches a guest. Checking a 23 second sequence
         * by taking screenshots and hoping is not a workflow.
         */
        if (process.env.NODE_ENV !== 'production') {
          // Structurally typed rather than importing GSAP's types, so this
          // debug hook adds nothing to the client bundle's import graph.
          (window as unknown as { __intro?: unknown }).__intro = timeline;
        }

        /*
         * ?beat=12.5 holds the sequence at that second instead of playing it.
         *
         * A twenty-three second animation cannot be checked by loading the
         * page and taking screenshots: the frame you want is gone before the
         * screenshot lands, and the sequence finishes and puts itself away
         * while you are still looking. This stops on the frame and stays
         * there. Development only.
         */
        const beat = params.get('beat');
        if (process.env.NODE_ENV !== 'production' && beat !== null && beat !== '') {
          timeline.pause(Number(beat));
        } else {
          timeline.play();
        }
      } catch {
        // A broken sequence must never cost anybody their invitation.
        if (run === runRef.current) finish();
      }
    },
    [finish, token],
  );

  useEffect(() => {
    void play(false);
    return () => {
      runRef.current += 1;
      cleanupRef.current?.();
      // Navigating away mid-sequence must not leave the page unscrollable.
      stageCard(false);
    };
  }, [play]);

  // A hung chunk or a changed motion preference must release the invitation.
  useEffect(() => {
    if (phase !== 'playing') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', changed);
    const debugHold = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('beat');
    const timeout = debugHold ? undefined : window.setTimeout(finish, (SEQUENCE_DURATION + 5) * 1000);
    return () => { motion.removeEventListener('change', changed); window.clearTimeout(timeout); };
  }, [phase, finish]);

  return (
    <>
      <div
        ref={overlayRef}
        className="intro"
        // Driven by state, not left as a bare `hidden`. It is set imperatively
        // too (see play), and this is what stops any later re-render from
        // disagreeing with that - or from leaving the overlay covering a
        // finished invitation.
        hidden={phase !== 'playing'}
        // The invitation underneath is the real content; this is scenery.
        aria-hidden="true"
        data-phase={phase}
      >
        <div className="intro-veil"><div className="intro-bokeh" /></div>
        <div className="intro-stage">{children}</div>
        <canvas className="intro-canvas" data-intro="canvas" />
      </div>

      {phase === 'finished' && canReplay && (
        <p className="replay-wrap">
          <button type="button" className="replay" onClick={() => void play(true)}>
            {labels.replay}
          </button>
        </p>
      )}
    </>
  );
}
