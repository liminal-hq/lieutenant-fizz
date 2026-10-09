// Tests for the haptic strength levels, their names and their master scales.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRENGTH,
  STRENGTH_NAMES,
  STRENGTH_SCALE,
  isStrength,
  stepStrength,
  strengthName,
  strengthScale,
} from './haptic-strength';

describe('strengths', () => {
  it('has four levels: Off, Light, Medium and Strong at 0, 0.5, 0.75 and 1', () => {
    expect([...STRENGTH_NAMES]).toEqual(['Off', 'Light', 'Medium', 'Strong']);
    expect([...STRENGTH_SCALE]).toEqual([0, 0.5, 0.75, 1]);
    expect(DEFAULT_STRENGTH).toBe(3);
  });

  it('accepts only whole numbers from 0 to 3', () => {
    for (const v of [0, 1, 2, 3]) expect(isStrength(v)).toBe(true);
    for (const v of [-1, 4, 1.5, '1', null, undefined, Number.NaN])
      expect(isStrength(v), String(v)).toBe(false);
  });

  it('names and scales a level, and treats a bad level as Strong', () => {
    expect(strengthName(1)).toBe('Light');
    expect(strengthScale(2)).toBe(0.75);
    expect(strengthName(9)).toBe('Strong');
    expect(strengthScale(-4)).toBe(1);
  });
});

describe('stepStrength', () => {
  it('stops at the ends when stepping and goes round when choosing', () => {
    expect(stepStrength(3, 1, false)).toBe(3);
    expect(stepStrength(0, -1, false)).toBe(0);
    expect(stepStrength(3, 1, true)).toBe(0);
    expect(stepStrength(0, -1, true)).toBe(3);
    expect(stepStrength(1, 1, false)).toBe(2);
    expect(stepStrength(2, -1, true)).toBe(1);
  });
});
