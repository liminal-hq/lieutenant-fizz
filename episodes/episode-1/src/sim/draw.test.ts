// Tests for reading the frame's sun out of the sim's `out` array.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { readSun } from './draw';
import { Out } from './protocol';

const out = (over: Partial<Record<keyof typeof Out, number>> = {}): Float32Array => {
  const o = new Float32Array(Out.LEN);
  for (const [k, v] of Object.entries(over)) o[Out[k as keyof typeof Out]] = v;
  return o;
};

describe('readSun', () => {
  it('is no sun when the colour is zero, which is what levels, the title and the cinematic write', () => {
    expect(readSun(out())).toBeUndefined();
    expect(readSun(out({ SUN_X: -0.5, SUN_Y: 0.3, SUN_Z: 0.8 }))).toBeUndefined();
  });

  it('gives a unit direction and the colour', () => {
    const sun = readSun(
      out({ SUN_X: -3, SUN_Y: 0, SUN_Z: 4, SUN_R: 0.5, SUN_G: 0.4, SUN_B: 0.25 }),
    )!;
    expect(sun.dir[0]).toBeCloseTo(-0.6);
    expect(sun.dir[1]).toBeCloseTo(0);
    expect(sun.dir[2]).toBeCloseTo(0.8);
    expect(Math.hypot(...sun.dir)).toBeCloseTo(1);
    expect(sun.colour[0]).toBeCloseTo(0.5);
    expect(sun.colour[1]).toBeCloseTo(0.4);
    expect(sun.colour[2]).toBeCloseTo(0.25);
  });

  it('is no sun when the direction has no length', () => {
    expect(readSun(out({ SUN_R: 1, SUN_G: 1, SUN_B: 1 }))).toBeUndefined();
  });
});

describe('the out array', () => {
  it('has room for the sun after the first fourteen values', () => {
    expect(Out.SUN_X).toBe(14);
    expect(Out.SUN_B).toBeLessThan(Out.LEN);
  });
});
