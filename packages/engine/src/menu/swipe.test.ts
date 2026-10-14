// Tests for the menu swipe.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SWIPE_MIN_PX, swipeDirection } from './swipe';

describe('swiping a menu', () => {
  it('goes to the next stop when the finger moves left and the previous when it moves right', () => {
    expect(swipeDirection(-120, 4)).toBe(1);
    expect(swipeDirection(120, -4)).toBe(-1);
  });

  it('needs the full distance', () => {
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeDirection(SWIPE_MIN_PX, 0)).toBe(-1);
    expect(swipeDirection(0, 0)).toBe(0);
  });

  it('ignores a drag that is mostly up and down, so scrolling a list is not a swipe', () => {
    expect(swipeDirection(-80, 120)).toBe(0);
    expect(swipeDirection(-80, 50)).toBe(1);
  });
});
