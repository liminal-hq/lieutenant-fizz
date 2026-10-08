// Tests for the touch controls: the sliding D-pad, hit testing, and held buttons with a minimum hold.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  MIN_HOLD_MS,
  NO_TOUCH,
  TouchState,
  contains,
  dpadDirections,
  hitTest,
  smallestSide,
  undersizedTargets,
  type TouchLayout,
} from './touch';

// A landscape phone: the D-pad bottom left, the buttons bottom right, Pause top right.
const LAYOUT: TouchLayout = {
  dpad: { cx: 100, cy: 300, r: 72 },
  jump: { cx: 700, cy: 320, r: 40 },
  fire: { cx: 620, cy: 340, r: 28 },
  pogo: { cx: 690, cy: 240, r: 26 },
  pause: { x: 760, y: 8, w: 48, h: 48 },
};

describe('dpadDirections', () => {
  const R = 100;
  it('holds nothing inside the dead zone', () => {
    expect(dpadDirections(0, 0, R)).toEqual({ left: false, right: false, up: false, down: false });
    expect(dpadDirections(25, -25, R)).toEqual({
      left: false,
      right: false,
      up: false,
      down: false,
    });
  });

  it('holds each of the four directions', () => {
    expect(dpadDirections(60, 0, R)).toMatchObject({ right: true, left: false });
    expect(dpadDirections(-60, 0, R)).toMatchObject({ left: true, right: false });
    expect(dpadDirections(0, -60, R)).toMatchObject({ up: true, down: false });
    expect(dpadDirections(0, 60, R)).toMatchObject({ down: true, up: false });
  });

  it('holds two bits on a diagonal', () => {
    expect(dpadDirections(50, 45, R)).toEqual({ left: false, right: true, up: false, down: true });
    expect(dpadDirections(-50, -45, R)).toEqual({
      left: true,
      right: false,
      up: true,
      down: false,
    });
  });

  it('drops the weaker axis when one is more than twice the other', () => {
    // Running right with the thumb drifting a little down must not aim or look down.
    expect(dpadDirections(80, 35, R)).toEqual({ left: false, right: true, up: false, down: false });
    // And the other way round.
    expect(dpadDirections(35, 80, R)).toEqual({ left: false, right: false, up: false, down: true });
  });

  it('treats a position outside the circle like the edge', () => {
    expect(dpadDirections(900, 0, R)).toMatchObject({ right: true });
    expect(dpadDirections(0, -900, R)).toMatchObject({ up: true });
  });
});

describe('hit testing', () => {
  it('contains points in circles and rectangles', () => {
    expect(contains({ cx: 0, cy: 0, r: 10 }, 6, 6)).toBe(true);
    expect(contains({ cx: 0, cy: 0, r: 10 }, 8, 8)).toBe(false);
    expect(contains({ x: 0, y: 0, w: 10, h: 20 }, 10, 20)).toBe(true);
    expect(contains({ x: 0, y: 0, w: 10, h: 20 }, 11, 5)).toBe(false);
  });

  it('finds the control a touch lands on, or none', () => {
    expect(hitTest(LAYOUT, 100, 300)).toBe('dpad');
    expect(hitTest(LAYOUT, 700, 320)).toBe('jump');
    expect(hitTest(LAYOUT, 690, 240)).toBe('pogo');
    expect(hitTest(LAYOUT, 780, 30)).toBe('pause');
    expect(hitTest(LAYOUT, 400, 100)).toBeNull();
  });

  it('lets the buttons win where hit areas overlap', () => {
    const overlapping: TouchLayout = { ...LAYOUT, dpad: { cx: 700, cy: 320, r: 90 } };
    expect(hitTest(overlapping, 700, 320)).toBe('jump');
    const fireOverJump: TouchLayout = { ...LAYOUT, jump: { cx: 640, cy: 330, r: 40 } };
    expect(hitTest(fireOverJump, 630, 335)).toBe('jump');
  });

  it('reports controls below the 48 dp minimum', () => {
    expect(smallestSide({ cx: 0, cy: 0, r: 24 })).toBe(48);
    expect(smallestSide({ x: 0, y: 0, w: 60, h: 40 })).toBe(40);
    expect(undersizedTargets(LAYOUT)).toEqual([]);
    const small: TouchLayout = { ...LAYOUT, pogo: { cx: 690, cy: 240, r: 22 } };
    expect(undersizedTargets(small)).toEqual(['pogo']);
    expect(undersizedTargets(small, 40)).toEqual([]);
  });
});

describe('TouchState', () => {
  const state = (): TouchState => new TouchState(LAYOUT);

  it('holds nothing before any touch, and ignores touches with no layout', () => {
    expect(state().held(0)).toEqual(NO_TOUCH);
    const bare = new TouchState();
    expect(bare.down(1, 700, 320, 0)).toBeNull();
    expect(bare.held(1)).toEqual(NO_TOUCH);
  });

  it('tracks two fingers at once: moving while jumping', () => {
    const t = state();
    expect(t.down(1, 160, 300, 0)).toBe('dpad');
    expect(t.down(2, 700, 320, 5)).toBe('jump');
    expect(t.held(10)).toMatchObject({ right: true, jump: true, left: false });
  });

  it('keeps a held button held well past the minimum hold', () => {
    const t = state();
    t.down(1, 700, 320, 0);
    expect(t.sample(MIN_HOLD_MS * 10).jump).toBe(true);
    t.up(1);
    expect(t.held(MIN_HOLD_MS * 10).jump).toBe(false);
  });

  it('lets a quick tap survive until the next step, then ends', () => {
    const t = state();
    t.down(1, 690, 240, 0);
    t.up(1);
    expect(t.sample(40).pogo).toBe(true);
    expect(t.held(MIN_HOLD_MS + 10).pogo).toBe(false);
  });

  it('keeps a tap until a step has sampled it, however long the frame takes', () => {
    const t = state();
    t.down(1, 690, 240, 0);
    t.up(1);
    // A slow frame arrives long after the finger lifted and the minimum hold ran out.
    expect(t.held(500).pogo).toBe(true);
    expect(t.sample(500).pogo).toBe(true);
    expect(t.held(501).pogo).toBe(false);
  });

  it('counts a tap that ends on lift like a quick press', () => {
    const t = state();
    t.tap('jump', 100);
    expect(t.held(120).jump).toBe(true);
    expect(t.sample(900).jump).toBe(true);
    expect(t.held(901).jump).toBe(false);
  });

  it('keeps a quick D-pad tap until a step has sampled it', () => {
    const t = state();
    // The thumb lands on the right arm and lifts before any frame has run.
    t.down(1, 100 + 60, 300, 0);
    t.up(1);
    expect(t.held(400)).toMatchObject({ right: true, left: false });
    expect(t.sample(400).right).toBe(true);
    expect(t.held(401).right).toBe(false);
  });

  it('does not keep a D-pad direction the thumb has slid away from once sampled', () => {
    const t = state();
    t.down(1, 100 + 60, 300, 0);
    expect(t.sample(5).right).toBe(true);
    t.move(1, 100 - 60, 300);
    expect(t.held(10)).toMatchObject({ left: true, right: false });
  });

  it('does not let a sample end a button that is still held', () => {
    const t = state();
    t.down(1, 700, 320, 0);
    expect(t.sample(10).jump).toBe(true);
    expect(t.sample(500).jump).toBe(true);
    t.up(1);
    expect(t.sample(600).jump).toBe(false);
  });

  it('re-evaluates the D-pad as the thumb slides, without lifting', () => {
    const t = state();
    t.down(1, 100 - 60, 300, 0);
    expect(t.sample(1)).toMatchObject({ left: true, down: false });
    t.move(1, 100 - 10, 300 + 60);
    expect(t.held(2)).toMatchObject({ left: false, down: true });
    t.move(1, 100, 300);
    expect(t.held(3)).toMatchObject({ left: false, right: false, up: false, down: false });
  });

  it('releases a finger on up', () => {
    const t = state();
    t.down(1, 160, 300, 0);
    t.sample(0);
    t.up(1);
    expect(t.held(1)).toEqual(NO_TOUCH);
    expect(t.active).toBe(false);
  });

  it('cancelAll drops every finger and latch', () => {
    const t = state();
    t.down(1, 160, 300, 0);
    t.down(2, 700, 320, 0);
    expect(t.active).toBe(true);
    t.cancelAll();
    expect(t.held(1)).toEqual(NO_TOUCH);
    expect(t.active).toBe(false);
  });

  it('reports a Pause touch without holding any bit', () => {
    const t = state();
    expect(t.down(1, 780, 30, 0)).toBe('pause');
    expect(t.held(1)).toEqual(NO_TOUCH);
    expect(t.active).toBe(false);
  });

  it('forgets a finger whose id is reused after a lost pointerup', () => {
    const t = state();
    t.down(1, 160, 300, 0);
    t.sample(1);
    t.down(1, 400, 100, 5); // lands on nothing
    expect(t.held(6)).toEqual(NO_TOUCH);
  });
});
