// Tests for the demo strip's size.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MAX_STRIP_SCALE, stripScale } from './strip';

describe('the demo strip scale', () => {
  it('is a whole number that fits its share of the window height', () => {
    expect(stripScale(390, 192)).toBe(1);
    expect(stripScale(720, 192)).toBe(2);
    expect(stripScale(1080, 192)).toBe(3);
    for (const h of [300, 390, 540, 720, 900, 1920]) {
      const s = stripScale(h, 192);
      expect(Number.isInteger(s)).toBe(true);
      expect(192 * s).toBeLessThanOrEqual(Math.max(192, h * 0.55));
    }
  });

  it('is never under 1 or over the most', () => {
    expect(stripScale(100, 192)).toBe(1);
    expect(stripScale(10000, 192)).toBe(MAX_STRIP_SCALE);
    expect(stripScale(500, 0)).toBe(1);
  });
});
