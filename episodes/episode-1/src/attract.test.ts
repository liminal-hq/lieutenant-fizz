// Tests for the attract loop's label and fade.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { ATTRACT_FADE, ATTRACT_LEVELS, attractFade, attractLabel, nextAttract } from './attract';

describe('attract loop', () => {
  it('goes through Crater Fields, Crystal Caves and Mildred’s Citadel, then round again', () => {
    expect(ATTRACT_LEVELS).toEqual(['Crater Fields', 'Crystal Caves', 'Mildred’s Citadel']);
    expect([0, 1, 2].map(nextAttract)).toEqual([1, 2, 0]);
  });

  it('labels the level being shown', () => {
    expect(attractLabel(0)).toBe('Attract · Crater Fields');
    expect(attractLabel(2)).toBe('Attract · Mildred’s Citadel');
    expect(attractLabel(4)).toBe('Attract · Crystal Caves');
  });
});

describe('attractFade', () => {
  const period = 60 * 40;

  it('starts black, clears over half a second and stays clear', () => {
    expect(attractFade(0, period, false)).toBe(1);
    expect(attractFade(30, period, false)).toBeCloseTo(0, 6);
    expect(attractFade(15, period, false)).toBeCloseTo(0.5, 6);
    expect(attractFade(60 * 20, period, false)).toBe(0);
  });

  it('goes black again over the last half second', () => {
    expect(attractFade(period - 15, period, false)).toBeCloseTo(0.5, 6);
    expect(attractFade(period, period, false)).toBe(1);
    expect(attractFade(period - 30, period, false)).toBeCloseTo(0, 6);
  });

  it('stays between 0 and 1', () => {
    for (let t = -10; t <= period + 10; t += 7) {
      const f = attractFade(t, period, false);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('never fades under reduced motion or with no period', () => {
    expect(attractFade(0, period, true)).toBe(0);
    expect(attractFade(period, period, true)).toBe(0);
    expect(attractFade(0, 0, false)).toBe(0);
    expect(ATTRACT_FADE).toBe(0.5);
  });
});
