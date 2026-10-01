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

/** One canvas, driven by the master timeline so pause, skip and replay stop every mote. */
function particleRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * scale;
  canvas.height = height * scale;
  context.scale(scale, scale);

  // Prepaint optical halos once, rather than allocating gradients every frame.
  const dust = document.createElement('canvas');
  dust.width = dust.height = 24;
  const glow = dust.getContext('2d')!;
  const light = glow.createRadialGradient(12, 12, 0, 12, 12, 12);
  light.addColorStop(0, '#fff4d0');
  light.addColorStop(.18, '#dec188');
  light.addColorStop(1, 'rgba(224,190,125,0)');
  glow.fillStyle = light;
  glow.fillRect(0, 0, 24, 24);
  const petal = document.createElement('canvas');
  petal.width = petal.height = 48;
  const bloom = petal.getContext('2d')!;
  const blush = bloom.createLinearGradient(8, 7, 36, 39);
  blush.addColorStop(0, '#fff5e8');
  blush.addColorStop(.45, '#edd6c7');
  blush.addColorStop(1, '#c6a694');
  bloom.fillStyle = blush;
  bloom.beginPath();
  bloom.moveTo(7, 24);
  bloom.bezierCurveTo(5, 7, 38, 6, 40, 22);
  bloom.bezierCurveTo(35, 39, 12, 36, 7, 24);
  bloom.fill();
  const random = (index: number, salt: number) => {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const particles = Array.from({ length: MAX_PARTICLES }, (_, index) => ({
    x: (index % 2 ? .74 : .03) + random(index, 1) * .23,
    y: .06 + random(index, 2) * .87,
    r: index < 4 ? 4 + random(index, 3) * 4 : .5 + random(index, 3) * .8,
    drift: (random(index, 4) - .5) * 12,
    speed: index < 4 ? 9 + random(index, 5) * 9 : -3 - random(index, 5) * 4,
    angle: random(index, 6) * Math.PI,
    delay: random(index, 7) * .16,
    petal: index < 4,
  }));
  const clear = () => context.clearRect(0, 0, width, height);
  return {
    clear,
    render(progress: number, kind: 'seal' | 'petals', origin = { x: width / 2, y: height / 2 }) {
      clear();
      for (const [index, p] of particles.entries()) {
        if (kind === 'seal' && index >= 9) break;
        const life = Math.max(0, Math.min(1, (progress - p.delay) / (1 - p.delay)));
        const time = life * (kind === 'seal' ? 1.2 : 2.6);
        const isPetal = kind === 'petals' && p.petal;
        const radius = kind === 'seal' ? .4 + random(index, 8) * .6 : p.r;
        const x = kind === 'seal'
          ? origin.x + (random(index, 9) - .5) * 24 * (1 - Math.exp(-time * 2))
          : p.x * width + p.drift * time + Math.sin(time * .7 + p.angle) * 3;
        const y = kind === 'seal'
          ? origin.y - 3 * time + 12 * time * time
          : p.y * height + p.speed * time;
        context.save();
        context.globalAlpha = Math.sin(life * Math.PI) * (kind === 'seal' ? .58 : isPetal ? .5 : .48);
        context.translate(x, y);
        context.rotate(p.angle + time * (isPetal ? .16 : .05));
        if (isPetal) context.scale(.72 + .2 * Math.cos(time * .8 + p.angle), 1);
        const size = radius * (isPetal ? 3 : 7);
        context.drawImage(isPetal ? petal : dust, -size / 2, -size / 2, size, size);
        context.restore();
      }
    },
  };
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
    if (veil) timeline.fromTo(veil, { scale: 1.022 }, { scale: 1, duration: SEQUENCE_DURATION, ease: 'sine.inOut' }, 0);
    const bokeh = root.querySelector('.intro-bokeh');
    if (bokeh) {
      timeline.fromTo(bokeh, { x: -3, y: 4, opacity: .12 }, { x: 3, y: -4, opacity: .28, duration: 5.5, ease: 'sine.inOut' }, 0);
      timeline.to(bokeh, { x: 0, y: -7, opacity: .2, duration: 3, ease: 'sine.inOut' }, 20);
    }
    const canvas = root.querySelector<HTMLCanvasElement>('[data-intro="canvas"]');
    const particles = canvas ? particleRenderer(canvas) : null;
    if (particles) cleanups.push(particles.clear);

    for (const beat of BEATS) {
      timeline.addLabel(beat.id, beat.start);
      const found = targets(root, beat);
      if (!found.length) continue;
      switch (beat.effect) {
        case 'wipe':
          // A small optical approach. Closing arrives after the paper begins dissolving.
          timeline.fromTo(found, { opacity: 0, y: 2, scale: .987 }, { opacity: 1, y: 0, scale: 1, duration: beat.revealChildren ? 1.1 : 2.05, ease: beat.ease }, beat.start + (beat.revealChildren ? .3 : .12));
          if (beat.revealChildren) {
            const children = found.flatMap(el => Array.from(el.querySelectorAll(beat.revealChildren!)));
            timeline.fromTo(children, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: .85, stagger: .18, ease: 'sine.out' }, beat.start + .72);
          }
          break;
        case 'fade':
          timeline.fromTo(found, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: beat.duration * .88, ease: beat.ease }, beat.start + .06);
          break;
        case 'rise':
          if (beat.id === 'envelope-appears') {
            timeline.fromTo(found, { y: 12, rotation: -.65, rotationX: 4, scale: .984, transformPerspective: 1200 }, { y: 0, rotation: 0, rotationX: 0, scale: 1, duration: 2.45, ease: beat.ease }, beat.start);
            timeline.fromTo(found, { opacity: 0 }, { opacity: 1, duration: 1.35, ease: 'sine.inOut' }, beat.start + .08);
          } else {
            timeline.fromTo(found, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: .8, ease: 'sine.out' }, beat.start + .08);
          }
          break;
        case 'crack': {
          const left = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-left"]');
          const right = found[0]?.querySelector<SVGGraphicsElement>('[id*="seal-right"]');
          timeline.to(found, { scale: .988, y: -.5, duration: .3, ease: 'sine.inOut' }, beat.start);
          timeline.to(found, { scale: 1, y: 0, duration: .45, ease: 'sine.out' }, beat.start + .3);
          for (const [half, direction] of [[left, -1], [right, 1]] as const) {
            if (!half) continue;
            gsap.set(half, { transformBox: 'fill-box', transformOrigin: direction < 0 ? 'right center' : 'left center' });
            timeline.fromTo(half, { rotation: 0, x: 0, y: 0 }, { rotation: direction * 3.2, x: direction * 2.7, y: .8, duration: .86, ease: beat.ease }, beat.start + .3);
            timeline.to(half, { rotation: direction * 4.8, x: direction * 4, y: 3.2, duration: .5, ease: 'sine.in' }, beat.start + 1.16);
          }
          timeline.fromTo(found, { opacity: 1 }, { opacity: 0, y: 5, duration: .52, ease: 'sine.in' }, beat.start + 1.3);
          if (particles && canvas) {
            const release = { progress: 0 };
            const origin = { x: 0, y: 0 };
            timeline.to(release, {
              progress: 1, duration: 1.2, ease: 'none',
              onStart: () => {
                const seal = found[0]!.getBoundingClientRect();
                const field = canvas.getBoundingClientRect();
                origin.x = seal.left + seal.width / 2 - field.left;
                origin.y = seal.top + seal.height / 2 - field.top;
              },
              onUpdate: () => particles.render(release.progress, 'seal', origin),
            }, beat.start + .58);
          }
          const flap = root.querySelector('[data-intro="flap"]');
          if (flap) {
            timeline.fromTo(flap, { rotationX: 0 }, { rotationX: 166, duration: 1.25, ease: 'power2.inOut' }, beat.start + 1.05);
            timeline.set(flap, { zIndex: 1 }, beat.start + 1.68);
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
            timeline.fromTo(sleeve, { y: 0 }, { y: lift, duration: beat.duration, ease: beat.ease }, beat.start);
            timeline.to(envelope, { y: drop, duration: beat.duration, ease: beat.ease }, beat.start);
            const paperShade = sleeve.querySelector('.env-sleeve-shade');
            if (paperShade) timeline.fromTo(paperShade, { opacity: .65 }, { opacity: 0, duration: beat.duration * .85, ease: 'sine.inOut' }, beat.start + .12);
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
          found.forEach((cluster, index) => {
            const upper = cluster.id.includes('top-right');
            const duration = beat.duration - index * (beat.stagger ?? 0);
            const at = beat.start + index * (beat.stagger ?? 0);
            gsap.set(cluster, { transformBox: 'fill-box', transformOrigin: upper ? 'right top' : 'left bottom' });
            timeline.fromTo(cluster, { scale: .965, rotation: upper ? .8 : -.7, x: upper ? 2 : -2, y: upper ? -2 : 2 }, { scale: 1, rotation: 0, x: 0, y: 0, duration, ease: beat.ease }, at);
            timeline.fromTo(cluster, { opacity: 0 }, { opacity: 1, duration: duration * .78, ease: 'sine.inOut' }, at);
          });
          break;
        case 'stagger': {
          const ordered = topToBottom(found);
          ordered.forEach((line, index) => {
            const names = line.classList.contains('card-names');
            const at = beat.start + index * (beat.stagger ?? 0) + (names ? .18 : 0);
            const duration = Math.min(names ? 1.25 : .95, beat.start + beat.duration - at);
            timeline.fromTo(line, { opacity: 0, y: names ? 5 : 3, scale: names ? .99 : 1 }, { opacity: 1, y: 0, scale: 1, duration, ease: names ? 'power2.out' : beat.ease }, at);
          });
          break;
        }
        case 'sweep':
          timeline.fromTo(found, { xPercent: -105 }, { xPercent: 105, duration: .86, ease: beat.ease }, beat.start + .04);
          timeline.fromTo(found, { opacity: 0 }, { opacity: .5, duration: .18, ease: 'sine.out' }, beat.start + .04);
          timeline.to(found, { opacity: 0, duration: .25, ease: 'sine.in' }, beat.start + .65);
          break;
        case 'particles': {
          if (particles) {
            const field = { progress: 0 };
            timeline.to(field, { progress: 1, duration: 2.6, ease: 'none', onUpdate: () => particles.render(field.progress, 'petals') }, beat.start);
          }
          break;
        }
      }
      if (beat.exitAt !== undefined) timeline.to(found, { opacity: 0, duration: beat.exitDuration ?? .8, ease: 'sine.inOut' }, beat.exitAt);
    }

    const ending = BEATS.find(beat => beat.id === 'monogram-ending')!;
    const handoff = ending.start + ending.duration - .65;
    timeline.to(root.querySelector('[data-intro="closing"]'), { opacity: 0, duration: .65, ease: 'sine.inOut' }, handoff - .15);
    // Set the finished card back into its natural layout UNDER the scenery.
    // The final dissolve reveals that same composition without a fixed-to-flow jump.
    timeline.call(onHandoff, undefined, handoff);
    timeline.set(root.querySelector('[data-intro="card"]'), { opacity: 1, scale: 1, yPercent: 0, rotation: 0 }, handoff);
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
