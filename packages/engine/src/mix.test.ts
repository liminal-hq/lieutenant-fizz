// Tests for the mix stage's ramps: the worked examples from the design, and the direction rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MIX_OPEN, MIX_RAMP, holdRamp, mixRamps, valueAt } from './mix';

const PAUSE = { lpf: 900, gain: 0.7 };

describe('mixRamps and valueAt', () => {
  it('closes into pause over 0.18 s: 7114 Hz at 10.06, 2531 Hz at 10.12, 900 Hz at 10.18', () => {
    const r = mixRamps(MIX_OPEN, PAUSE, 10);
    expect(r.lpf.t1).toBeCloseTo(10.18, 10);
    expect(valueAt(r.lpf, 10.06)).toBeCloseTo(7114, -1);
    expect(Math.round(valueAt(r.lpf, 10.06))).toBe(7114);
    expect(valueAt(r.lpf, 10.12)).toBeCloseTo(2531, -1);
    expect(valueAt(r.lpf, 10.18)).toBeCloseTo(900, 6);
    // The gain falls in a straight line from 1 to 0.7 (-3.1 dB).
    expect(valueAt(r.gain, 10)).toBe(1);
    expect(valueAt(r.gain, 10.09)).toBeCloseTo(0.85, 10);
    expect(valueAt(r.gain, 10.18)).toBeCloseTo(0.7, 10);
    expect(20 * Math.log10(0.7)).toBeCloseTo(-3.1, 1);
  });

  it('opens on resume over 0.35 s, with its midpoint near 4243 Hz', () => {
    const r = mixRamps(PAUSE, MIX_OPEN, 5);
    expect(r.lpf.t1).toBeCloseTo(5 + MIX_RAMP.open, 10);
    expect(valueAt(r.lpf, 5 + MIX_RAMP.open / 2)).toBeCloseTo(4243, 0);
    expect(valueAt(r.gain, 5 + MIX_RAMP.open / 2)).toBeCloseTo(0.85, 10);
  });

  it('is exponential for the cutoff and linear for the gain', () => {
    const r = mixRamps(MIX_OPEN, PAUSE, 0);
    expect(r.lpf.kind).toBe('exp');
    expect(r.gain.kind).toBe('lin');
  });

  it('treats a gain-only change as closing when it falls and opening when it rises', () => {
    const speech = { lpf: 20000, gain: 0.7 };
    expect(mixRamps(MIX_OPEN, speech, 0).gain.t1).toBeCloseTo(MIX_RAMP.close, 10);
    expect(mixRamps(speech, MIX_OPEN, 0).gain.t1).toBeCloseTo(MIX_RAMP.open, 10);
  });

  it('opens when the cutoff rises even though the gain falls, and closes when it falls', () => {
    const card = { lpf: 2200, gain: 0.8 };
    expect(mixRamps(PAUSE, { lpf: 2200, gain: 0.5 }, 0).lpf.t1).toBeCloseTo(MIX_RAMP.open, 10);
    expect(mixRamps(MIX_OPEN, card, 0).lpf.t1).toBeCloseTo(MIX_RAMP.close, 10);
  });

  it('starts a new ramp from where the last one had got to', () => {
    const first = mixRamps(MIX_OPEN, PAUSE, 0);
    const mid = { lpf: valueAt(first.lpf, 0.06), gain: valueAt(first.gain, 0.06) };
    const back = mixRamps(mid, MIX_OPEN, 0.06);
    expect(valueAt(back.lpf, 0.06)).toBeCloseTo(7114, -1);
    expect(valueAt(back.gain, 0.06)).toBeCloseTo(0.9, 10);
    expect(valueAt(back.lpf, 0.06 + MIX_RAMP.open)).toBeCloseTo(20000, 6);
  });

  it('holds its ends outside the ramp and for a ramp of no length', () => {
    const r = mixRamps(MIX_OPEN, PAUSE, 3);
    expect(valueAt(r.lpf, 0)).toBe(20000);
    expect(valueAt(r.lpf, 99)).toBe(900);
    expect(valueAt(holdRamp('exp', 1234, 7), 7)).toBe(1234);
    expect(valueAt(holdRamp('lin', 0.5, 7), 0)).toBe(0.5);
  });
});
