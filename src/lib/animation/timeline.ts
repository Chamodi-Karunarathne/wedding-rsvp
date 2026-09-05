import gsap from 'gsap';
import { BEATS, MAX_PARTICLES, type Beat } from './beats';

/**
 * Turns the beat data into a GSAP timeline.
 *
 * GSAP core only - no plugins. Core is covered by GSAP's standard "no charge"
 * licence (see the `license` field in gsap/package.json); every effect below
 * is reachable without a plugin, so nothing here needs a licence review.
 *
 * ONLY transform and opacity are animated. Nothing in this file touches
 * width, height, top, left, box-shadow or filter, because all of those
 * trigger layout or paint on a phone that is already doing enough.
 */

type Cleanup = () => void;

/** A beat whose target matches nothing is skipped, never thrown for. */
function targets(root: ParentNode, beat: Beat): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(beat.target));
}

/**
 * Text lines in the order they appear DOWN THE CARD, not in the document.
 *
 * line-07-names is last in the exported file but seventh down the card, so
 * source order would reveal the couple's names after the blessing. Sorting by
 * rendered geometry makes the export order irrelevant.
 */
function topToBottom(elements: HTMLElement[]): HTMLElement[] {
  return [...elements].sort((a, b) => {
    const ay = a instanceof SVGGraphicsElement ? a.getBBox().y : 0;
    const by = b instanceof SVGGraphicsElement ? b.getBBox().y : 0;
    return ay - by;
  });
}

/**
 * Beat 10. One canvas, a hard cap, and torn down when the beat ends.
 *
 * DOM nodes for this would be a hundred and twenty elements entering and
 * leaving the document mid-sequence, which is exactly the shape of jank.
 */
function startParticles(canvas: HTMLCanvasElement, seconds: number): Cleanup {
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * scale;
  canvas.height = canvas.clientHeight * scale;
  context.scale(scale, scale);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const petals = Array.from({ length: MAX_PARTICLES }, () => ({
    x: Math.random() * width,
    y: -Math.random() * height,
    r: 1.5 + Math.random() * 3.5,
    vy: 18 + Math.random() * 42,
    vx: -10 + Math.random() * 20,
    spin: Math.random() * Math.PI,
    // Two thirds petals, one third gold dust - the storyboard is mostly
    // petals with gold caught in among them.
    gold: Math.random() > 0.66,
  }));

  let frame = 0;
  let last = performance.now();
  const endsAt = last + seconds * 1000;

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    context.clearRect(0, 0, width, height);
    // Fade the whole field out over the beat rather than stopping dead.
    const remaining = Math.max(0, (endsAt - now) / (seconds * 1000));

    for (const p of petals) {
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      p.spin += dt;
      if (p.y > height) p.y = -8;

      context.globalAlpha = remaining * 0.85;
      context.fillStyle = p.gold ? '#e3c356' : '#f6dfe6';
      context.beginPath();
      context.ellipse(p.x, p.y, p.r, p.r * 0.55, p.spin, 0, Math.PI * 2);
      context.fill();
    }

    if (now < endsAt) frame = requestAnimationFrame(tick);
    else context.clearRect(0, 0, width, height);
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    context.clearRect(0, 0, width, height);
  };
}

export type BuiltTimeline = {
  timeline: gsap.core.Timeline;
  cleanup: Cleanup;
};

/**
 * Builds the whole sequence. `root` scopes every selector, so a second
 * invitation on the page (there never is one) could not cross-talk.
 */
export function buildIntroTimeline(root: ParentNode, onComplete: () => void): BuiltTimeline {
  const cleanups: Cleanup[] = [];
  const timeline = gsap.timeline({ paused: true, onComplete });

  /*
   * Anything a beat reveals later starts hidden.
   *
   * These are real elements in the server HTML - which is what makes the
   * sequence progressive enhancement - so they are visible until something
   * hides them. Nothing did, and "WE LOOK FORWARD TO CELEBRATING WITH YOU" was
   * on screen under the monogram from the first frame, twenty seconds before
   * the beat that is supposed to bring it in.
   *
   * Hidden HERE, in script, and never in CSS: if this code never runs the
   * closing line simply renders with the rest of the page, which is the whole
   * point of the overlay being optional.
   */
  const deferred = Array.from(root.querySelectorAll<HTMLElement>('[data-intro-reveal]'));
  if (deferred.length > 0) gsap.set(deferred, { opacity: 0 });

  for (const beat of BEATS) {
    const found = targets(root, beat);
    if (found.length === 0) continue;

    switch (beat.effect) {
      case 'wipe': {
        // A mask sweeping across the mark. clip-path is composited and does
        // not trigger layout; the fallback is a plain fade if it is not
        // supported, which is no worse than not running the beat.
        timeline.fromTo(
          found,
          { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
          {
            opacity: 1,
            clipPath: 'inset(0 0% 0 0)',
            duration: beat.duration,
            ease: beat.ease,
          },
          beat.start,
        );

        // The closing line, on the beat that declares it. The monogram
        // appears twice and only carries the line the second time.
        if (beat.revealChildren) {
          const children = found.flatMap((element) =>
            Array.from(element.querySelectorAll<HTMLElement>(beat.revealChildren ?? '')),
          );
          if (children.length > 0) {
            timeline.fromTo(
              children,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: beat.duration * 0.5, ease: 'power1.out', stagger: 0.2 },
              beat.start + beat.duration * 0.45,
            );
          }
        }
        break;
      }

      case 'fade':
        timeline.to(found, { opacity: 1, duration: beat.duration, ease: beat.ease }, beat.start);
        break;

      case 'rise':
        timeline.fromTo(
          found,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: beat.duration, ease: beat.ease },
          beat.start,
        );
        break;

      case 'crack': {
        // Each half turns about its own INNER edge. Without fill-box the
        // origin is the SVG viewport corner and the halves swing away across
        // the screen instead of opening.
        const left = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-left"]');
        const right = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-right"]');

        for (const [half, origin, angle] of [
          [left, 'right center', -22],
          [right, 'left center', 22],
        ] as const) {
          if (!half) continue;
          gsap.set(half, { transformBox: 'fill-box', transformOrigin: origin });
          timeline.to(
            half,
            { rotation: angle, x: angle > 0 ? 6 : -6, duration: beat.duration, ease: beat.ease },
            beat.start,
          );
        }

        timeline.to(
          found,
          { opacity: 0, duration: beat.duration * 0.4, ease: 'power1.in' },
          beat.start + beat.duration * 0.6,
        );

        /*
         * The flap lifts as the halves fall away. Part of this beat rather
         * than a twelfth one: the storyboard has eleven, breaking a seal and
         * opening the flap are one moment, and beats.test.ts holds the count
         * to eleven precisely so the sequence cannot drift from the boards.
         *
         * rotationX, not rotation, so it folds away from the viewer like paper
         * rather than spinning in the plane of the screen.
         */
        const flap = root.querySelector<HTMLElement>('[data-intro="flap"]');
        if (flap) {
          timeline.to(
            flap,
            {
              rotationX: -168,
              transformPerspective: 900,
              duration: beat.duration * 0.85,
              ease: 'power2.inOut',
            },
            beat.start + beat.duration * 0.45,
          );
        }
        break;
      }

      case 'slide': {
        /*
         * The card comes out of the envelope, and only then does the envelope
         * go.
         *
         * Three things move, in this order, or it does not read as one motion:
         * the sleeve - the card panel INSIDE the envelope - draws upward from
         * behind the front panel; the real card fades in over it as it clears;
         * and the envelope drops away underneath once the card is out, not
         * while it is still emerging.
         */
        const envelope = root.querySelector<HTMLElement>('[data-intro="envelope"]');
        const sleeve = root.querySelector<HTMLElement>('[data-intro="sleeve"]');

        if (sleeve) {
          // Up and out. -86% clears the envelope's top edge completely.
          timeline.to(
            sleeve,
            { yPercent: -86, scale: 1.04, duration: beat.duration * 0.8, ease: beat.ease },
            beat.start,
          );
          // Handed over to the real card as it arrives, rather than left to
          // sit behind it looking like a second card.
          timeline.to(
            sleeve,
            { opacity: 0, duration: beat.duration * 0.3, ease: 'power1.in' },
            beat.start + beat.duration * 0.55,
          );
        }

        timeline.fromTo(
          found,
          { opacity: 0, y: 40, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: beat.duration * 0.75, ease: beat.ease },
          beat.start + beat.duration * 0.5,
        );

        if (envelope) {
          timeline.to(
            envelope,
            { opacity: 0, y: 70, scale: 0.96, duration: beat.duration * 0.6, ease: 'power2.in' },
            beat.start + beat.duration * 0.55,
          );
        }
        break;
      }

      case 'bloom': {
        for (const cluster of found) {
          if (cluster instanceof SVGGraphicsElement) {
            const box = cluster.getBBox();
            // Grow from the stem base: the corner nearest the card edge the
            // cluster is anchored to, so it unfurls inwards.
            const fromLeft = box.x < 200;
            gsap.set(cluster, {
              transformBox: 'fill-box',
              transformOrigin: fromLeft ? 'left bottom' : 'right top',
            });
          }
        }
        timeline.fromTo(
          found,
          { opacity: 0, scale: 0.82 },
          {
            opacity: 1,
            scale: 1,
            duration: beat.duration,
            ease: beat.ease,
            stagger: beat.stagger,
          },
          beat.start,
        );
        break;
      }

      case 'stagger':
        timeline.fromTo(
          topToBottom(found),
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: Math.max(0.35, beat.duration - (found.length - 1) * (beat.stagger ?? 0)),
            ease: beat.ease,
            stagger: beat.stagger,
          },
          beat.start,
        );
        break;

      case 'sweep':
        // A gradient element translated across the card. Not a filter: a
        // filter on a card this size is a repaint per frame.
        timeline.fromTo(
          found,
          { opacity: 0, xPercent: -120 },
          {
            opacity: 1,
            xPercent: 120,
            duration: beat.duration,
            ease: beat.ease,
            onComplete: () => gsap.set(found, { opacity: 0 }),
          },
          beat.start,
        );
        break;

      case 'particles': {
        const canvas = found[0];
        if (canvas instanceof HTMLCanvasElement) {
          timeline.call(
            () => {
              cleanups.push(startParticles(canvas, beat.duration));
            },
            undefined,
            beat.start,
          );
        }
        break;
      }
    }

    /*
     * The target leaving again. Added after the beat's own tweens so it wins
     * on the same property, and placed at an absolute time so a beat can leave
     * long after it arrived - the card is raised at 8s and only clears at 20s.
     */
    if (beat.exitAt !== undefined) {
      timeline.to(
        found,
        {
          opacity: 0,
          duration: beat.exitDuration ?? 0.8,
          ease: 'power1.inOut',
        },
        beat.exitAt,
      );
    }
  }

  return {
    timeline,
    cleanup: () => {
      for (const stop of cleanups) stop();
      timeline.kill();
    },
  };
}
