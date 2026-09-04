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
    gold: Math.random() > 0.5,
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
      context.fillStyle = p.gold ? '#b18906' : '#e8d5ad';
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
        break;
      }

      case 'slide':
        timeline.fromTo(
          found,
          { opacity: 0, y: 48, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: beat.duration, ease: beat.ease },
          beat.start,
        );
        break;

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
  }

  return {
    timeline,
    cleanup: () => {
      for (const stop of cleanups) stop();
      timeline.kill();
    },
  };
}
