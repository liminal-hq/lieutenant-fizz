// The opening titles' timeline: where everything is at a moment of the 12.8 second sequence.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * The titles are Liminal HQ presents, the Lieutenant Fizz wordmark and the chase, set to a song of eight bars at 150
 * beats a minute. This file only works out the picture for a time `T` in seconds, in a 1920 by 1080 space; `titles-draw.ts`
 * paints it. The cues and tweens are the DOS port's (`titles.rs`), which the design's HD version shares, and the
 * song's clock decides `T`, so the picture stays in time with the music.
 */

/** The width and height of the space the titles are laid out in. */
export const TITLES_W = 1920;
export const TITLES_H = 1080;

/** One pass of the titles, in seconds and in 60 Hz ticks. */
export const TITLES_SECONDS = 12.8;
export const TITLES_TICKS = 768;

/** Where each section begins, in seconds. Each lands on a bar of the song. */
export const CUES = { presents: 0, words: 3.2, chase: 6.4 } as const;

/** Where the chase's ground starts. */
export const GROUND = 968;

export const ACCENT = '#ffaa40';
export const ROSE = '#f43f5e';
export const MUTED = '#b4bfce';

// ---------- Easing and tweens ----------

type Ease = (t: number) => number;

export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

/** `from` until `start`, `to` from `end`, and `ease` in between. */
const tween =
  (ease: Ease) =>
  (start: number, end: number, from: number, to: number) =>
  (T: number): number => {
    if (T <= start) return from;
    if (T >= end) return to;
    return from + (to - from) * ease((T - start) / (end - start));
  };

/** A move that overshoots and settles (the design's `enter`). */
export const enter = tween(easeOutBack);

/** A smooth move from one place to another (the design's `slide`). */
export const slide = tween(easeInOutCubic);

/** 0 before `a`, rising to 1 by `b`, holding, then falling back to 0 between `c` and `d`. */
export const win = (T: number, a: number, b: number, c: number, d: number): number =>
  slide(a, b, 0, 1)(T) * (1 - slide(c, d, 0, 1)(T));

/** The design's small deterministic noise, in [0, 1). */
export const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Which of an animation's two frames is on, `fps` times a second. */
export const frameAt = (T: number, fps: number): 0 | 1 => (Math.floor(T * fps) % 2 === 0 ? 0 : 1);

// ---------- The backdrop ----------

const STAR_COLOURS = ['#ffffff', '#55ffff', '#ffff55', '#ff55ff', '#5555ff'] as const;

export interface Star {
  x: number;
  y: number;
  size: number;
  colour: string;
  alpha: number;
}

/** Seventy stars drifting left and twinkling. */
export function stars(T: number): Star[] {
  const span = TITLES_W + 40;
  return Array.from({ length: 70 }, (_, i) => {
    const size = rnd(i + 9) > 0.8 ? 8 : 4;
    const x = ((((rnd(i) * span - T * (20 + size * 8)) % span) + span) % span) - 20;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(T * (1 + rnd(i + 3) * 2) + i));
    return {
      x: Math.round(x / 4) * 4,
      y: Math.round((rnd(i + 1) * 900) / 4) * 4,
      size,
      colour: STAR_COLOURS[i % 5] ?? '#ffffff',
      alpha: twinkle,
    };
  });
}

export interface WordRow {
  text: string;
  /** The row's top edge. */
  y: number;
  /** How far the row is shifted sideways. */
  x: number;
  colour: string;
  alpha: number;
}

/** Four rows of "Lieutenant" and "Fizz" drifting behind everything, surging as the words arrive. */
export function wordRows(T: number): WordRow[] {
  const boost =
    slide(CUES.words, CUES.words + 1.4, 0, 900)(T) +
    slide(CUES.words + 1.4, CUES.chase, 0, -600)(T);
  const dim = 0.55 - slide(CUES.chase, CUES.chase + 0.8, 0, 0.35)(T);
  const fadeIn = slide(0, 0.6, 0, 1)(T);
  const rows = [
    { word: 'Lieutenant', dir: -1, colour: '#0000aa' },
    { word: 'Fizz', dir: 1, colour: '#aa00aa' },
    { word: 'Lieutenant', dir: -1, colour: '#0000aa' },
    { word: 'Fizz', dir: 1, colour: '#aa00aa' },
  ];
  return rows.map((r, i) => {
    const travel = (T * (160 + i * 40) + boost * (1 + i * 0.2)) * r.dir;
    const base = r.dir < 0 ? -200 - i * 300 : -5200 + i * 260;
    return {
      text: Array(8).fill(r.word).join('  '),
      y: i * 270 + 3,
      x: Math.round(base + travel),
      colour: r.colour,
      alpha: dim * fadeIn,
    };
  });
}

// ---------- Liminal HQ presents ----------

export interface Presents {
  /** The mark's sideways shift and tilt. */
  markX: number;
  markTilt: number;
  /** How hard the mark's glow is, from 0 to 1. */
  glow: number;
  nameX: number;
  nameAlpha: number;
  presentsAlpha: number;
  presentsY: number;
}

export function presents(T: number): Presents {
  const P = CUES.presents;
  const out = CUES.words - 0.5;
  return {
    markX: enter(P + 0.2, P + 1.0, -900, 0)(T) + slide(out, out + 0.5, 0, -1400)(T),
    markTilt: enter(P + 0.2, P + 1.0, -40, 0)(T),
    glow: 0.5 + 0.5 * Math.sin(T * 3),
    nameX: enter(P + 0.7, P + 1.4, 900, 0)(T) + slide(out + 0.05, out + 0.5, 0, 1600)(T),
    nameAlpha: win(T, P + 0.7, P + 1.0, out + 0.3, out + 0.5),
    presentsAlpha: win(T, P + 1.5, P + 1.8, out, out + 0.3),
    presentsY: enter(P + 1.5, P + 2.0, 40, 0)(T),
  };
}

// ---------- The wordmark ----------

export interface Wordmark {
  /** "Lieutenant" and "Fizz": how far each is shifted, and its slant in degrees. */
  lieutenantX: number;
  lieutenantSkew: number;
  fizzX: number;
  fizzSkew: number;
  /** The whole card's scale (the slam's punch and the settle) and lift. */
  scale: number;
  lift: number;
  kickerAlpha: number;
  kickerX: number;
  lineAlpha: number;
  lineY: number;
}

const skewOf = (x: number): number => Math.max(-25, Math.min(25, x / 60));

export function wordmark(T: number): Wordmark {
  const Wd = CUES.words;
  const C = CUES.chase;
  const lieutenantX = enter(Wd + 0.1, Wd + 0.7, 2400, 0)(T);
  const fizzX = enter(Wd + 0.6, Wd + 1.2, -2400, 0)(T);
  const punch =
    1 + 0.08 * Math.max(0, 1 - Math.abs(T - (Wd + 1.25)) / 0.25) * (T > Wd + 1.0 ? 1 : 0);
  return {
    lieutenantX,
    lieutenantSkew: skewOf(lieutenantX),
    fizzX,
    fizzSkew: skewOf(fizzX),
    scale: slide(C, C + 0.8, 1.08, 1)(T) * punch,
    lift: slide(C, C + 0.8, 0, -300)(T),
    kickerAlpha: win(T, Wd + 1.7, Wd + 2.0, 99, 100),
    kickerX: enter(Wd + 1.7, Wd + 2.2, -300, 0)(T),
    lineAlpha: win(T, C + 1.4, C + 1.7, 99, 100),
    lineY: enter(C + 1.4, C + 1.9, 30, 0)(T),
  };
}

/** The white flash as "Fizz" slams in, from 0 to 0.85. */
export function flash(T: number): number {
  const t = CUES.words + 1.2;
  if (T <= t - 0.05) return 0;
  return Math.max(0, 1 - Math.abs(T - t - 0.05) / 0.18) * (T > t ? 0.85 : 0.4);
}

/** How black the screen is: fully so at the very start and end, so the loop turns over unseen. */
export function fade(T: number): number {
  const end = slide(TITLES_SECONDS - 0.6, TITLES_SECONDS, 0, 1)(T);
  const start = 1 - slide(0, 0.4, 0, 1)(T);
  return Math.max(end, start);
}

// ---------- The chase ----------

/** How far the ground has risen: 160 pixels below at first, in place once the chase is under way. */
export const groundLift = (T: number): number =>
  slide(CUES.chase + 0.1, CUES.chase + 0.7, 160, 0)(T);

/** How far the ground's stripes have scrolled. */
export const groundScroll = (T: number): number => -((T * 900) % 96);

export interface SpeedLine {
  x: number;
  y: number;
  length: number;
}

/** How strongly the speed lines show, from 0 to 0.5. */
export const speedLineAlpha = (T: number): number =>
  win(T, CUES.chase + 0.4, CUES.chase + 0.8, 99, 100) * 0.5;

export function speedLines(T: number): SpeedLine[] {
  return Array.from({ length: 14 }, (_, i) => {
    const length = 120 + rnd(i + 40) * 260;
    const x =
      TITLES_W - ((T * (1600 + rnd(i) * 900) + rnd(i + 5) * TITLES_W) % (TITLES_W + length));
    return { x, y: 420 + rnd(i + 20) * 520, length };
  });
}

/** How many screen pixels one pixel of Ben's sprite takes. */
export const BEN_PX = 22;
/** The size of Ben's sprite, in its own pixels. */
export const BEN_W = 16;
export const BEN_H = 24;

export interface BenPose {
  x: number;
  y: number;
  run: number;
  squash: number;
  /** The lean, in degrees. */
  tilt: number;
  /** Where the muzzle is, which the bubbles leave from. */
  muzzle: { x: number; y: number };
}

/** Ben running, leaning back and squashing as each stride lands, with the muzzle's place worked out. */
export function benPose(t: number): BenPose {
  const C = CUES.chase;
  const bw = BEN_W * BEN_PX;
  const bh = BEN_H * BEN_PX;
  const x = enter(C + 0.3, C + 1.2, -700, 1260)(t) + Math.sin(t * 1.3) * 40;
  const run = Math.abs(Math.sin(t * Math.PI * 3.2));
  const y = GROUND - bh - run * 46;
  const squash = 1 + (run < 0.15 ? -0.07 : 0.04 * run);
  const tilt = 6 + run * 3;
  // The muzzle is at sprite pixel (16, 11.5), mirrored to local x 0, then scaled and turned about the bottom centre.
  const dx = (-8 * BEN_PX) / squash;
  const dy = -12.5 * BEN_PX * squash;
  const a = (tilt * Math.PI) / 180;
  return {
    x,
    y,
    run,
    squash,
    tilt,
    muzzle: {
      x: x + bw / 2 + dx * Math.cos(a) - dy * Math.sin(a),
      y: y + bh + dx * Math.sin(a) + dy * Math.cos(a),
    },
  };
}

/** The moment Ben appears, and the first and number of bubbles. */
export const BEN_FROM = CUES.chase + 0.25;
export const BUBBLE_COUNT = 16;

export interface Bubble {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/** The fizz bubbles in flight: one every 0.32 s, each flying left from the muzzle, then popping. */
export function bubbles(T: number): Bubble[] {
  const out: Bubble[] = [];
  const life = 0.7;
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const t0 = CUES.chase + 1.3 + i * 0.32;
    const age = T - t0;
    if (age < 0 || age > life + 0.15) continue;
    const k = Math.min(1, age / life);
    const popping = age > life;
    const radius = popping ? 34 + (age - life) * 300 : 10 + k * 22;
    const born = benPose(t0);
    out.push({
      x: born.muzzle.x - radius * 0.6 - k * (720 + rnd(i) * 200),
      y: born.muzzle.y,
      radius,
      alpha: popping ? 1 - (age - life) / 0.15 : 1,
    });
  }
  return out;
}

interface EnemyDef {
  /** The sprite's name without its frame, such as `gloop` for `gloop0` and `gloop1`. */
  sprite: string;
  x: number;
  /** How high above the ground a flier hangs. */
  fly: number;
  /** Screen pixels per sprite pixel. */
  px: number;
  phase: number;
  hops?: boolean;
}

const ENEMIES: readonly EnemyDef[] = [
  { sprite: 'gloop', x: 120, fly: 0, px: 11, phase: 0.0 },
  { sprite: 'hopper', x: 420, fly: 0, px: 11, phase: 1.1, hops: true },
  { sprite: 'beetle', x: 700, fly: 0, px: 10, phase: 2.3 },
  { sprite: 'sentry', x: -120, fly: 0, px: 11, phase: 0.7 },
  { sprite: 'bat', x: 300, fly: 330, px: 11, phase: 0.4 },
  { sprite: 'drone', x: 600, fly: 440, px: 10, phase: 1.9 },
  { sprite: 'phantom', x: 30, fly: 270, px: 11, phase: 2.8 },
];

export interface Enemy {
  /** The sprite to draw, such as `gloop1`. */
  sprite: string;
  x: number;
  /** The sprite's bottom edge, which the caller subtracts its drawn height from. */
  bottom: number;
  px: number;
  /** A flash of brightness as a bubble stuns it. */
  zap: boolean;
}

/** The seven Zargs charging in from the left, each at its own pace. */
export function enemies(T: number, anyBubble: boolean): Enemy[] {
  const C = CUES.chase;
  return ENEMIES.map((e, i) => {
    const arrive = C + 0.6 + i * 0.12;
    const x = slide(arrive, arrive + 1.0, e.x - 1400, e.x)(T) + Math.sin(T * 2.1 + e.phase) * 50;
    const hop = e.hops
      ? Math.abs(Math.sin(T * 4 + e.phase)) * 120
      : Math.abs(Math.sin(T * 7 + e.phase)) * 14;
    const bob = e.fly ? Math.sin(T * 3 + e.phase) * 36 : 0;
    return {
      sprite: `${e.sprite}${frameAt(T + e.phase, 6)}`,
      x,
      bottom: GROUND - e.fly - hop + bob,
      px: e.px,
      zap: anyBubble && Math.sin(T * 9 + e.phase * 3) > 0.92,
    };
  });
}
