import gsap from 'gsap';
import { BEATS, MAX_PARTICLES, SEQUENCE_DURATION, type Beat } from './beats';

type Cleanup = () => void;
function targets(root: ParentNode, beat: Beat): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(beat.target));
}

/** Compare rendered positions across both nested SVG and live HTML lines. */
function topToBottom(elements: HTMLElement[]): HTMLElement[] {
  return [...elements].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
}

/** One conservative canvas field. Static gradients give dust an optical halo. */
function startParticles(canvas: HTMLCanvasElement, seconds: number): Cleanup {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * scale;
  canvas.height = height * scale;
  context.scale(scale, scale);
  const particles = Array.from({ length: MAX_PARTICLES }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: index < 7 ? 4 + Math.random() * 5 : .5 + Math.random() * 1.1,
    vy: index < 7 ? 13 + Math.random() * 9 : -4 - Math.random() * 7,
    vx: -5 + Math.random() * 10,
    spin: Math.random() * Math.PI,
    petal: index < 7,
  }));
  let frame = 0;
  let last = performance.now();
  const beganAt = last;
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    const progress = Math.min(1, (now - beganAt) / (seconds * 1000));
    context.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * .2;
      // Keep the stationery sharp; the atmosphere sits primarily at the edges.
      const edge = Math.abs(p.x / width - .5) > .28 ? 1 : .28;
      context.globalAlpha = Math.sin(progress * Math.PI) * edge * (p.petal ? .55 : .7);
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.spin);
      if (p.petal) {
        const gradient = context.createLinearGradient(-p.r, -p.r, p.r, p.r);
        gradient.addColorStop(0, '#fff4e6');
        gradient.addColorStop(.5, '#e8cdbd');
        gradient.addColorStop(1, '#c8a897');
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(-p.r, 0);
        context.bezierCurveTo(-p.r, -p.r, p.r, -p.r * .6, p.r, 0);
        context.bezierCurveTo(p.r * .2, p.r, -p.r * .5, p.r * .4, -p.r, 0);
        context.fill();
      } else {
        const glow = context.createRadialGradient(0, 0, 0, 0, 0, p.r * 4);
        glow.addColorStop(0, '#fff0bd');
        glow.addColorStop(.2, '#ddbb77');
        glow.addColorStop(1, 'rgba(224,190,125,0)');
        context.fillStyle = glow;
        context.fillRect(-p.r * 4, -p.r * 4, p.r * 8, p.r * 8);
      }
      context.restore();
    }
    if (progress < 1) frame = requestAnimationFrame(tick);
    else context.clearRect(0, 0, width, height);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); context.clearRect(0, 0, width, height); };
}

export type BuiltTimeline = { timeline: gsap.core.Timeline; cleanup: Cleanup };

/** GSAP core; all frame-by-frame DOM animation uses transform and opacity. */
export function buildIntroTimeline(root: ParentNode, onComplete: () => void, onHandoff: () => void): BuiltTimeline {
  const cleanups: Cleanup[] = [];
  let timeline!: gsap.core.Timeline;
  // Capture setup sets as well as tweens, so skip/replay restores every layer.
  const context = gsap.context(() => {});
  try {
    context.add(() => {
    timeline = gsap.timeline({ paused: true, onComplete });
    const deferred = Array.from(root.querySelectorAll<HTMLElement>('[data-intro-reveal]'));
    gsap.set(deferred, { opacity: 0 });
    const veil = root.querySelector('.intro-veil');
    if (veil) timeline.fromTo(veil, { scale: 1.035 }, { scale: 1, duration: SEQUENCE_DURATION, ease: 'sine.inOut' }, 0);

    for (const beat of BEATS) {
      timeline.addLabel(beat.id, beat.start);
      const found = targets(root, beat);
      if (!found.length) continue;
      switch (beat.effect) {
        case 'wipe':
          // Soft light gathering on the foil, without a mechanical clipping wipe.
          timeline.fromTo(found, { opacity: 0, y: 8, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: beat.duration * .75, ease: beat.ease }, beat.start);
          if (beat.revealChildren) {
            const children = found.flatMap(el => Array.from(el.querySelectorAll(beat.revealChildren!)));
            timeline.fromTo(children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .8, stagger: .15, ease: 'sine.out' }, beat.start + .6);
          }
          break;
        case 'fade':
          timeline.fromTo(found, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: beat.duration, ease: beat.ease }, beat.start);
          break;
        case 'rise':
          timeline.fromTo(found, { opacity: 0, y: 18, rotation: -2, scale: .97 }, { opacity: 1, y: 0, rotation: 0, scale: 1, duration: beat.duration, ease: beat.ease }, beat.start);
          break;
        case 'crack': {
          const left = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-left"]');
          const right = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-right"]');
          for (const [half, direction] of [[left, -1], [right, 1]] as const) {
            if (!half) continue;
            gsap.set(half, { transformBox: 'fill-box', transformOrigin: direction < 0 ? 'right center' : 'left center' });
            timeline.fromTo(half, { rotation: 0, x: 0, y: 0 }, { rotation: direction * 9, x: direction * 5, y: 4, duration: beat.duration * .85, ease: beat.ease }, beat.start);
          }
          timeline.fromTo(found, { opacity: 1 }, { opacity: 0, y: 12, duration: .6, ease: 'power2.in' }, beat.start + 1.3);
          const flap = root.querySelector('[data-intro="flap"]');
          if (flap) {
            timeline.fromTo(flap, { rotationX: 0 }, { rotationX: 166, duration: 1.35, ease: 'power2.inOut' }, beat.start + .9);
            timeline.set(flap, { zIndex: 1 }, beat.start + 1.7);
          }
          break;
        }
        case 'slide': {
          const sleeve = root.querySelector('[data-intro="sleeve"]');
          const envelope = root.querySelector('[data-intro="envelope"]');
          if (sleeve && envelope && found[0]) {
            const cardHeight = found[0].offsetHeight;
            const envelopeHeight = (envelope as HTMLElement).offsetHeight;
            const drop = (cardHeight + envelopeHeight) / 2 + 32;
            const lift = (envelopeHeight - cardHeight) / 2 - envelopeHeight * .06 - drop;
            // The opaque pocket moves down while the matching paper rises.
            // Both have the same easing, so the paper's world-space path is continuous.
            timeline.fromTo(sleeve, { y: 0 }, { y: lift, duration: beat.duration, ease: 'power2.inOut' }, beat.start);
            timeline.to(envelope, { y: drop, duration: beat.duration, ease: 'power2.inOut' }, beat.start);
            // Identical dimensions, border and paper at the handoff: no ghost card.
            timeline.set(found, { opacity: 1, y: 0, yPercent: 0, rotation: 0, scale: 1 }, beat.start + beat.duration);
            timeline.set(sleeve, { opacity: 0 }, beat.start + beat.duration);
            timeline.to(envelope, { opacity: 0, duration: .4 }, beat.start + beat.duration);
          } else {
            timeline.fromTo(found, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: beat.duration, ease: beat.ease }, beat.start);
          }
          break;
        }
        case 'bloom':
          for (const cluster of found) {
            gsap.set(cluster, { transformBox: 'fill-box', transformOrigin: cluster.id.includes('top-right') ? 'right top' : 'left bottom' });
          }
          timeline.fromTo(found, { opacity: 0, scale: .94, rotation: -1.5 }, { opacity: 1, scale: 1, rotation: 0, duration: beat.duration - (found.length - 1) * (beat.stagger ?? 0), stagger: beat.stagger, ease: beat.ease }, beat.start);
          break;
        case 'stagger':
          timeline.fromTo(topToBottom(found), { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: Math.max(.4, beat.duration - (found.length - 1) * (beat.stagger ?? 0)), stagger: beat.stagger, ease: beat.ease }, beat.start);
          break;
        case 'sweep':
          timeline.fromTo(found, { opacity: 0, xPercent: -110 }, { opacity: .85, xPercent: 110, duration: beat.duration, ease: beat.ease }, beat.start);
          timeline.to(found, { opacity: 0, duration: .2 }, beat.start + beat.duration - .2);
          break;
        case 'particles': {
          const canvas = found[0];
          if (canvas instanceof HTMLCanvasElement) timeline.call(() => { cleanups.push(startParticles(canvas, beat.duration + 1)); }, undefined, beat.start);
          break;
        }
      }
      if (beat.exitAt !== undefined) timeline.to(found, { opacity: 0, duration: beat.exitDuration ?? .8, ease: 'sine.inOut' }, beat.exitAt);
    }

    const ending = BEATS.find(beat => beat.id === 'monogram-ending')!;
    const handoff = ending.start + ending.duration - .65;
    timeline.to('[data-intro="closing"]', { opacity: 0, duration: .6, ease: 'sine.inOut' }, handoff - .2);
    // Set the finished card back into its natural layout UNDER the scenery.
    // The final dissolve reveals that same composition without a fixed-to-flow jump.
    timeline.call(onHandoff, undefined, handoff);
    timeline.set('[data-intro="card"]', { opacity: 1, scale: 1, yPercent: 0, rotation: 0 }, handoff);
    timeline.to(root.querySelector('.intro'), { opacity: 0, duration: .65, ease: 'sine.inOut' }, handoff);
    });
  } catch (error) {
    context.revert();
    throw error;
  }
  return {
    timeline,
    cleanup: () => { for (const stop of cleanups) stop(); context.revert(); },
  };
}
