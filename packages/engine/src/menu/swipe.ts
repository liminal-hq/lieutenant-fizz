// What a horizontal swipe on a menu means: a step to the next or the previous stop.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How far a finger must travel sideways, in CSS pixels, to count as a swipe. */
export const SWIPE_MIN_PX = 60;

/** How much further sideways than up or down a swipe must go, so scrolling a list is not a swipe. */
export const SWIPE_AXIS_RATIO = 1.5;

/**
 * Which way a drag from one point to another swipes: -1 for towards the previous stop (the finger went right),
 * 1 for the next (the finger went left), or 0 when it was a tap, too short or too much up and down.
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return 0;
  return dx < 0 ? 1 : -1;
}
