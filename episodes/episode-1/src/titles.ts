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

/**
 * The space the titles are painted into: at least 1920 by 1080 of it is the picture's own (centred), and a screen that is
 * wider or taller than that gets more backdrop around it, so the titles fill the screen as the title menu does.
 */
export interface View {
  w: number;
  h: number;
}

/** The picture's own space. */
export const DESIGN: View = { w: TITLES_W, h: TITLES_H };

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

/** Seventy stars drifting left and twinkling, placed across the whole `view`. */
export function stars(T: number, view: View = DESIGN): Star[] {
  const span = view.w + 40;
  return Array.from({ length: 70 }, (_, i) => {
    const size = rnd(i + 9) > 0.8 ? 8 : 4;
    const x = ((((rnd(i) * span - T * (20 + size * 8)) % span) + span) % span) - 20;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(T * (1 + rnd(i + 3) * 2) + i));
    return {
      x: Math.round(x / 4) * 4,
      y: Math.round((rnd(i + 1) * 900 * (view.h / TITLES_H)) / 4) * 4,
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

/** Fourteen streaks racing left across the whole `view`. */
export function speedLines(T: number, view: View = DESIGN): SpeedLine[] {
  return Array.from({ length: 14 }, (_, i) => {
    const length = 120 + rnd(i + 40) * 260;
    const x = view.w - ((T * (1600 + rnd(i) * 900) + rnd(i + 5) * view.w) % (view.w + length));
    return { x, y: 420 + rnd(i + 20) * 520, length };
  });
}

/** How many screen pixels one pixel of Ben's sprite takes. */
export const BEN_PX = 17;
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

/** The moment Ben appears. */
export const BEN_FROM = CUES.chase + 0.25;

/** How fast a fizz bubble flies, in pixels a second, and how long a stunned Zarg stays down. */
const SHOT_SPEED = 1536;
export const STUN_SECONDS = 0.9;
/** How long a Zarg is flashed white by a hit. */
export const HIT_FLASH = 0.08;
/** How far a bubble reaches either side of its middle (across and up and down): its box meets a Zarg's when they overlap. */
const REACH = 28;
const REACH_Y = 16;
/** How fast the ground runs under a Zarg that is knocked down on it, and how far it can be carried back. */
const GROUND_SPEED = 900;

interface EnemyDef {
  /** The sprite's name without its frame, such as `gloop` for `gloop0` and `gloop1`. */
  sprite: string;
  /** The sprite's size in its own pixels. */
  w: number;
  h: number;
  x: number;
  /** How high above the ground a flier hangs. */
  fly: number;
  /** Screen pixels per sprite pixel. */
  px: number;
  phase: number;
  /** The yellow hopper: it jumps high, and it is the key the shots are timed to. */
  hops?: boolean;
  /** A bigger bounce on the spot (the gloop). */
  bounce?: number;
  /** Knocked down on the moving ground, it slides back with it (the hopper). */
  slides?: boolean;
  /** Rears up into the line of fire when the hopper is down in front of it (the gloop). */
  rears?: boolean;
}

const ENEMIES: readonly EnemyDef[] = [
  { sprite: 'gloop', w: 16, h: 16, x: 120, fly: 0, px: 11, phase: 0.0, bounce: 55, rears: true },
  { sprite: 'hopper', w: 16, h: 16, x: 420, fly: 0, px: 11, phase: 1.1, hops: true, slides: true },
  { sprite: 'beetle', w: 16, h: 16, x: 700, fly: 0, px: 10, phase: 2.3 },
  { sprite: 'sentry', w: 24, h: 16, x: -120, fly: 0, px: 11, phase: 0.7 },
  { sprite: 'bat', w: 16, h: 16, x: 300, fly: 330, px: 11, phase: 0.4 },
  { sprite: 'drone', w: 16, h: 16, x: 600, fly: 440, px: 10, phase: 1.9 },
  { sprite: 'phantom', w: 16, h: 24, x: 30, fly: 270, px: 11, phase: 2.8 },
];

const HOPPER = ENEMIES.findIndex((e) => e.slides);
const GLOOP = ENEMIES.findIndex((e) => e.rears);

interface Hit {
  enemy: number;
  at: number;
}

interface Pose {
  x: number;
  bottom: number;
  w: number;
  h: number;
  /** The hit that has this Zarg down, if one has. */
  stun: Hit | undefined;
}

/** When the hopper was last hit by time `t`, the hit that stuns the gloop after it, and when the hopper is back on its feet. */
function hopperState(
  t: number,
  hits: readonly Hit[],
): { hit: Hit; gloop?: Hit; recover: number } | null {
  let hit: Hit | undefined;
  for (const c of hits) if (c.enemy === HOPPER && c.at <= t) hit = c;
  if (!hit) return null;
  const h = hit;
  const gloop = hits.find((c) => c.enemy === GLOOP && c.at > h.at);
  return { hit, gloop, recover: Math.min(h.at + 1.6, gloop ? gloop.at + 0.75 : Infinity) };
}

function hopperDown(t: number, hits: readonly Hit[]): ReturnType<typeof hopperState> {
  const hs = hopperState(t, hits);
  return hs && t < hs.recover ? hs : null;
}

/** How far a hit at time `at` has pushed a Zarg back by time `t`, from 0 to 1: out, held while it is down, then eased back. */
function knocked(t: number, at: number): number {
  const d = t - at;
  if (d < 0) return 0;
  if (d < 0.25) return Math.sin((d / 0.25) * (Math.PI / 2));
  if (d < STUN_SECONDS) return 1;
  return 1 - slide(STUN_SECONDS, STUN_SECONDS + 0.3, 0, 1)(d);
}

/**
 * How high a Zarg is off the ground at `t` when nothing has hit it: its hop or bounce. With the hopper down in front of
 * it, the gloop rears up into the line of fire: the rear eases in once the hopper has gone down and eases out before
 * the hopper is back, so the gloop never jumps from one height to another.
 */
function hopOf(i: number, t: number, hits: readonly Hit[]): number {
  const e = ENEMIES[i]!;
  const idle = e.hops
    ? Math.abs(Math.sin(t * 4 + e.phase)) * 120
    : Math.abs(Math.sin(t * (e.bounce ? 5 : 7) + e.phase)) * (e.bounce ?? 12);
  if (!e.rears) return idle;
  const hs = hopperDown(t, hits);
  if (!hs) return idle;
  const weight =
    slide(hs.hit.at + 0.1, hs.hit.at + 0.4, 0, 1)(t) *
    (1 - slide(hs.recover - 0.3, hs.recover, 0, 1)(t));
  const rear = Math.abs(Math.sin((t - hs.hit.at) * 7)) * 132;
  return idle + (rear - idle) * weight;
}

/**
 * Where a Zarg is at time `t`, given the hits so far. A hit grounds it for 0.9 s and knocks it back a little; the
 * hopper is knocked back furthest, so it drops out of the line of fire, and the gloop behind it rears up to be hit
 * next. This is the DOS port's choreography (its `mock.ts`), in this picture's pixels, with the falls and the
 * recoveries eased so nothing jumps.
 */
function pose(i: number, t: number, hits: readonly Hit[]): Pose {
  const e = ENEMIES[i]!;
  const arrive = CUES.chase + 0.6 + i * 0.12;
  let x = slide(arrive, arrive + 1.0, e.x - 1400, e.x)(t) + Math.sin(t * 2.1 + e.phase) * 50;
  let hop = hopOf(i, t, hits);
  let stun: Hit | undefined;
  if (e.slides) {
    // Knocked down on the moving ground it slides back with it until the gloop behind it is stunned too, then
    // springs forward to its place in the pack.
    const hs = hopperState(t, hits);
    if (hs) {
      const back = (tt: number): number =>
        -Math.min(GROUND_SPEED * Math.max(0, tt - hs.hit.at - 0.08), 460);
      if (t < hs.recover) {
        stun = hs.hit;
        const k = Math.min(1, (t - hs.hit.at) / 0.2);
        const hopAtHit = Math.abs(Math.sin(hs.hit.at * 4 + e.phase)) * 120;
        hop = Math.max(0, hopAtHit * (1 - k) + Math.sin(k * Math.PI) * 33);
        x += back(t);
      } else if (t < hs.recover + 0.5) {
        const k = (t - hs.recover) / 0.5;
        x += back(hs.recover) * Math.pow(1 - k, 3);
        hop = Math.sin(k * Math.PI) * 187;
      }
    }
  } else {
    let last: Hit | undefined;
    for (const h of hits) if (h.enemy === i && t >= h.at) last = h;
    if (last) {
      const d = t - last.at;
      x -= 33 * knocked(t, last.at);
      if (d < STUN_SECONDS) {
        // It falls to the ground from where the hit caught it, rather than dropping out of the air.
        stun = last;
        const k = Math.min(1, d / 0.3);
        hop = hopOf(i, last.at, hits) * (1 - k * k);
      } else {
        // And rises into its bounce again.
        hop *= slide(STUN_SECONDS, STUN_SECONDS + 0.3, 0, 1)(d);
      }
    }
  }
  const bob = e.fly ? Math.sin(t * 3 + e.phase) * 36 : 0;
  return { x, bottom: GROUND - e.fly - hop + bob, w: e.w * e.px, h: e.h * e.px, stun };
}

export interface Shot {
  /** When Ben fires, and where the muzzle is then. Every bubble flies straight left from there. */
  fired: number;
  from: { x: number; y: number };
  /** When it hits a Zarg and which one, or null for a bubble that flies on and off the screen. */
  hit: Hit | null;
}

/**
 * Ben's shots, worked out once as the DOS port works them out. Every bubble flies dead straight left from the muzzle
 * and stuns the first Zarg whose box it runs into. He fires every 0.32 s, but times his fizz to the hopper: while it
 * is in the pack he fires so the bubble meets it at the top of a jump, the one place it crosses the line of fire;
 * the hit knocks it back out of the way and the next bubble reaches the gloop, which rears up to meet it. He holds
 * his fire between the gloop's stun and the hopper landing back in the pack. Each shot sees the hits before it.
 */
function planShots(): { shots: Shot[]; hits: Hit[] } {
  const hits: Hit[] = [];
  const shots: Shot[] = [];
  const muzzle = (t: number): { x: number; y: number } => benPose(t).muzzle;
  const nextShot = (t: number): number => {
    const hs = hopperState(t, hits);
    if ((hs && t < hs.recover + 0.5) || t < CUES.chase + 1.2) return t;
    const ph = ENEMIES[HOPPER]!.phase;
    for (let k = Math.ceil(((t + 0.3) * 4 + ph - Math.PI / 2) / Math.PI); k < 999; k++) {
      const peak = (Math.PI / 2 + k * Math.PI - ph) / 4;
      let t0 = peak - 0.45;
      for (let n = 0; n < 3; n++) {
        const p = pose(HOPPER, peak, hits);
        t0 = peak - (muzzle(t0).x - REACH - (p.x + p.w)) / SHOT_SPEED;
      }
      if (t0 >= t) return t0;
    }
    return t;
  };
  let tNext = CUES.chase + 1.3;
  for (let n = 0; n < 24; n++) {
    const fired = nextShot(tNext);
    tNext = fired + 0.32;
    if (fired > CUES.chase + 6.2) break;
    // Ben holds his fire from the gloop's stun until the hopper has landed back in the pack, so nothing in flight
    // meets the hopper mid-jump.
    const hs = hopperState(fired, hits);
    if (hs?.gloop && fired >= hs.gloop.at && fired < hs.recover + 0.6) continue;
    const m = muzzle(fired);
    let hit: Hit | null = null;
    for (let a = 0; a <= 1.4 && !hit; a += 1 / 60) {
      const bx = m.x - REACH - SHOT_SPEED * a;
      for (let j = 0; j < ENEMIES.length && !hit; j++) {
        const p = pose(j, fired + a, hits);
        if (
          bx - REACH <= p.x + p.w &&
          bx + REACH >= p.x &&
          m.y + REACH_Y >= p.bottom - p.h &&
          m.y - REACH_Y <= p.bottom
        ) {
          hit = { enemy: j, at: fired + a };
        }
      }
    }
    if (hit) hits.push(hit);
    shots.push({ fired, from: m, hit });
  }
  return { shots, hits };
}

let plan: ReturnType<typeof planShots> | undefined;
const planned = (): ReturnType<typeof planShots> => (plan ??= planShots());

/** The moments Ben fires and what each shot hits, for the tests: the shots held back are not in the list. */
export const shotsPlanned = (): readonly Shot[] => planned().shots;

export interface Fizz {
  kind: 'bubble' | 'pop';
  x: number;
  y: number;
  /** Screen pixels per sprite pixel for a bubble, and the pop's scale. */
  scale: number;
  alpha: number;
}

/** The fizz bubbles in flight, flying straight left, and the pops of the ones that hit. */
export function fizz(T: number): Fizz[] {
  const out: Fizz[] = [];
  for (const s of planned().shots) {
    const age = T - s.fired;
    if (age < 0) continue;
    const spent = s.hit ? s.hit.at - s.fired : Infinity;
    const x = s.from.x - REACH - SHOT_SPEED * Math.min(age, spent);
    if (age < spent) {
      if (x > -200) {
        out.push({
          kind: 'bubble',
          x,
          y: s.from.y,
          scale: 4 + 3 * Math.min(1, age / 0.15),
          alpha: 1,
        });
      }
    } else if (s.hit && age < spent + 0.25) {
      const d = (age - spent) / 0.25;
      out.push({ kind: 'pop', x, y: s.from.y, scale: 4 + d * 8, alpha: 1 - d });
    }
  }
  return out;
}

export interface Enemy {
  /** The sprite to draw, such as `gloop1`. */
  sprite: string;
  x: number;
  /** The sprite's bottom edge, which the caller subtracts its drawn height from. */
  bottom: number;
  px: number;
  /** The sprite's size in its own pixels. */
  w: number;
  h: number;
  /** Down and dazed by a hit, with the game's stun stars over it. */
  stunned: boolean;
  /** Flashed white in the instant of a hit. */
  flash: boolean;
  /** Which of the stars' two frames is on. */
  stars: 0 | 1;
}

/** The seven Zargs charging in from the left, each at its own pace, and stunned where a bubble has hit. */
export function enemies(T: number): Enemy[] {
  const { hits } = planned();
  return ENEMIES.map((e, i) => {
    const p = pose(i, T, hits);
    return {
      sprite: `${e.sprite}${p.stun ? 0 : frameAt(T + e.phase, 6)}`,
      x: p.x,
      bottom: p.bottom,
      px: e.px,
      w: e.w,
      h: e.h,
      stunned: !!p.stun,
      flash: !!p.stun && T - p.stun.at < HIT_FLASH,
      stars: Math.floor(T * 6) % 2 === 0 ? 0 : 1,
    };
  });
}
