// The mix stage's pure part: the shape of a mix state and the ramps between two of them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How the music is heard: a low-pass cutoff in Hz (`MIX_OPEN_LPF` is open) and a gain (linear). */
export interface MixShape {
  lpf: number;
  gain: number;
}

/** A ramp of one parameter from `from` at `t0` to `to` at `t1`, exponential or linear. */
export interface Ramp {
  kind: 'exp' | 'lin';
  from: number;
  to: number;
  t0: number;
  t1: number;
}

/** A low-pass at this cutoff is out of the way: the mix is open. */
export const MIX_OPEN_LPF = 20000;

/** The mix that changes nothing. */
export const MIX_OPEN: MixShape = { lpf: MIX_OPEN_LPF, gain: 1 };

/**
 * Seconds a mix change takes. It closes quickly, so the muffle is there as the menu appears, and
 * opens slowly, so the music comes back rather than snapping.
 */
export const MIX_RAMP = { close: 0.18, open: 0.35 };

/** The ramps from one mix to another: the cutoff exponentially (pitch-like), the gain linearly. */
export interface MixRamps {
  lpf: Ramp;
  gain: Ramp;
}

/**
 * The ramps from `from` to `to` starting at `now`. A change that lowers the cutoff, or lowers the
 * gain at the same cutoff, closes the mix over `MIX_RAMP.close`; any other change opens it over
 * `MIX_RAMP.open`. Both parameters take the same time so they arrive together.
 */
export function mixRamps(from: MixShape, to: MixShape, now: number): MixRamps {
  const closing = to.lpf < from.lpf || (to.lpf === from.lpf && to.gain < from.gain);
  const t1 = now + (closing ? MIX_RAMP.close : MIX_RAMP.open);
  return {
    lpf: { kind: 'exp', from: from.lpf, to: to.lpf, t0: now, t1 },
    gain: { kind: 'lin', from: from.gain, to: to.gain, t0: now, t1 },
  };
}

/** A ramp that is already at `value`, for a change applied without gliding. */
export function holdRamp(kind: Ramp['kind'], value: number, at: number): Ramp {
  return { kind, from: value, to: value, t0: at, t1: at };
}

/**
 * Where a ramp is at time `t`: its start before `t0`, its end from `t1`, and between them the
 * exponential `from * (to / from) ^ u` or the straight line, where `u` runs 0 to 1. Used to start
 * a new ramp from where the last one has got to, without asking the audio thread.
 */
export function valueAt(r: Ramp, t: number): number {
  if (r.t1 <= r.t0 || t >= r.t1) return r.to;
  if (t <= r.t0) return r.from;
  const u = (t - r.t0) / (r.t1 - r.t0);
  return r.kind === 'exp' ? r.from * Math.pow(r.to / r.from, u) : r.from + (r.to - r.from) * u;
}
