// Tests the EGA palette table and its colour helpers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { EGA, hexToRgb, isColour, luminance } from './palette';

describe('palette', () => {
  it('has the 16 EGA colours as distinct #rrggbb values', () => {
    const values = Object.values(EGA);
    expect(values).toHaveLength(16);
    expect(new Set(values).size).toBe(16);
    for (const v of values) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('recognises palette codes only', () => {
    expect(isColour('k')).toBe(true);
    expect(isColour('W')).toBe(true);
    expect(isColour('x')).toBe(false);
    expect(isColour('')).toBe(false);
    expect(isColour('toString')).toBe(false);
  });

  it('parses hex into 0..255 channels', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#aa5500')).toEqual([0xaa, 0x55, 0x00]);
  });

  it('orders luminance from black to white within 0..1', () => {
    expect(luminance('k')).toBe(0);
    expect(luminance('W')).toBeCloseTo(1, 10);
    expect(luminance('y')).toBeGreaterThan(luminance('B'));
    for (const c of Object.keys(EGA) as (keyof typeof EGA)[]) {
      expect(luminance(c)).toBeGreaterThanOrEqual(0);
      expect(luminance(c)).toBeLessThanOrEqual(1);
    }
  });
});
