// Portable haptic patterns (transient taps and continuous hums) and the compiler to `navigator.vibrate`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A value over time: `t` is milliseconds from the start of the event, `v` is 0 to 1. Linear between points. */
export type Curve = readonly { t: number; v: number }[];

/**
 * One haptic event. A transient is a tap; a continuous event is a hum that lasts `duration` ms. Intensity
 * and sharpness are 0 to 1 (sharpness is how crisp: 0 is a dull thud, 1 is a click). `at` is the start in
 * ms from the start of the pattern.
 */
export type HapticEvent =
  | { kind: 'transient'; at: number; intensity: number; sharpness: number }
  | {
      kind: 'continuous';
      at: number;
      duration: number;
      intensity: number | Curve;
      sharpness: number | Curve;
    };

export interface HapticPattern {
  events: readonly HapticEvent[];
}

/**
 * What a cue does when another is running: `interrupt` cuts it off (unless it is a higher priority),
 * `drop-if-busy` is skipped while anything plays, `queue` waits for the running pattern when it ends
 * within a short time, and `coalesce` folds repeats within the window into one stronger pulse.
 */
export type Policy = 'interrupt' | 'queue' | 'drop-if-busy' | { coalesce: number };

/** `game` cues follow the action and stay silent outside a level; `ui` cues answer the menus. */
export type Lane = 'game' | 'ui';

export interface HapticCue {
  pattern: HapticPattern;
  /** 0 (lightest) to 4 (never cut off by a lower one). */
  priority: 0 | 1 | 2 | 3 | 4;
  /** The least time between two plays of the cue, in ms. */
  cooldownMs: number;
  policy: Policy;
  lane: Lane;
  /** Happens somewhere in the world: felt only while it is on screen. */
  world?: boolean;
  /** Kept short and soft when the player has asked for less motion. */
  calm?: boolean;
}

export interface HapticTable {
  cues: Record<string, HapticCue>;
  /** Caption text to cue id; `null` is silent on purpose. */
  captions: Record<string, string | null>;
}

/** Tunable constants of the `navigator.vibrate` compiler (on and off only, so strength becomes duty). */
export interface VibrateCompile {
  /** Length of one slice of a hum, in ms. */
  period: number;
  /** The shortest pulse worth sending. */
  minOn: number;
  /** A gap shorter than this is filled in, because the motor cannot stop and start that fast. */
  minOff: number;
  /** Intensity below this plays nothing. */
  floor: number;
  /** Pulse length of the weakest tap above the floor, in ms. */
  tBase: number;
  /** How much longer the strongest tap pulses, in ms. */
  tSpan: number;
  /** The longest pattern sent, in ms. */
  maxMs: number;
}

export const VIBRATE_COMPILE: Readonly<VibrateCompile> = {
  period: 20,
  minOn: 6,
  minOff: 4,
  floor: 0.16,
  tBase: 8,
  tSpan: 16,
  maxMs: 1000,
};

/** Rounds half up, nudged so a product like `0.675 * 20` that lands just under .5 still rounds up. */
function round(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

/** The value of a constant or a curve at `t` ms (clamped to the first and last points). */
export function sampleCurve(v: number | Curve, t: number): number {
  if (typeof v === 'number') return v;
  const first = v[0];
  const last = v[v.length - 1];
  if (!first || !last) return 0;
  if (t <= first.t) return first.v;
  if (t >= last.t) return last.v;
  for (let i = 1; i < v.length; i++) {
    const b = v[i];
    const a = v[i - 1];
    if (!a || !b || t > b.t) continue;
    return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  }
  return last.v;
}

/** How long the pattern lasts in ms, before any compiling. */
export function patternLength(p: HapticPattern): number {
  let end = 0;
  for (const e of p.events) end = Math.max(end, e.kind === 'transient' ? e.at : e.at + e.duration);
  return end;
}

/** Total time a compiled vibrate array spends on (the even entries). */
export function onTime(compiled: readonly number[]): number {
  let t = 0;
  for (let i = 0; i < compiled.length; i += 2) t += compiled[i] ?? 0;
  return t;
}

/** Total length of a compiled vibrate array in ms. */
export function totalTime(compiled: readonly number[]): number {
  return compiled.reduce((a, b) => a + b, 0);
}

/**
 * Compiles a pattern to the array `navigator.vibrate` takes (on, off, on, ...), scaled by `scale`
 * (the cue's own scale times the master strength). A tap becomes one pulse whose length grows with
 * intensity and shortens with sharpness. A hum is cut into `period` slices, each sampled in the middle: a
 * strong slice is full on and a weaker one is on for that fraction of the slice. Anything under
 * `floor` plays nothing. An empty array means silent.
 */
export function compileVibrate(
  p: HapticPattern,
  scale = 1,
  c: Readonly<VibrateCompile> = VIBRATE_COMPILE,
): number[] {
  const on: [number, number][] = [];
  for (const e of p.events) {
    if (e.kind === 'transient') {
      const i = Math.min(1, e.intensity * scale);
      if (i < c.floor) continue;
      const len = Math.max(c.minOn, round((c.tBase + c.tSpan * i) * (1.15 - 0.3 * e.sharpness)));
      on.push([e.at, e.at + len]);
      continue;
    }
    for (let off = 0; off < e.duration; off += c.period) {
      const len = Math.min(c.period, e.duration - off);
      const v = Math.min(1, sampleCurve(e.intensity, off + len / 2) * scale);
      if (v < c.floor) continue;
      const lit = v >= 0.9 ? len : Math.min(len, Math.max(c.minOn, round(v * c.period)));
      on.push([e.at + off, e.at + off + lit]);
    }
  }
  on.sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  for (const [s, e] of on) {
    const last = runs[runs.length - 1];
    if (last && s - last[1] < c.minOff) last[1] = Math.max(last[1], e);
    else runs.push([s, e]);
  }
  const out: number[] = [];
  let cursor = 0;
  for (const [s0, e0] of runs) {
    if (s0 >= c.maxMs) break;
    const s = round(s0);
    const e = round(Math.min(e0, c.maxMs));
    if (e <= s) continue;
    if (out.length === 0 && s > 0) out.push(0);
    if (out.length > 0) out.push(s - cursor);
    out.push(e - s);
    cursor = e;
  }
  return out;
}
