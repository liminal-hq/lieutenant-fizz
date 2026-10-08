// Tests for the held-direction auto-repeat used by the menus.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { HeldRepeat, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, repeatCount } from './repeat';

const UP = 4;
const DOWN = 8;
const JUMP = 16;
const DIRS = 1 | 2 | UP | DOWN;

/** Runs a 60 fps frame loop from `from` to `to` ms and counts how often `bit` fires. */
const fires = (r: HeldRepeat, bits: number, from: number, to: number, bit: number): number => {
  let n = 0;
  for (let t = from; t <= to; t += 1000 / 60) if (r.update(bits, t) & bit) n++;
  return n;
};

describe('repeatCount', () => {
  it('counts only the press until the delay runs out', () => {
    expect(repeatCount(0)).toBe(1);
    expect(repeatCount(REPEAT_DELAY_MS - 1)).toBe(1);
  });

  it('fires again at the delay and then once per interval', () => {
    expect(REPEAT_DELAY_MS).toBe(350);
    expect(REPEAT_INTERVAL_MS).toBe(90);
    expect(repeatCount(350)).toBe(2);
    expect(repeatCount(439)).toBe(2);
    expect(repeatCount(440)).toBe(3);
    expect(repeatCount(350 + 90 * 5)).toBe(7);
  });

  it('takes its own delay and interval', () => {
    expect(repeatCount(100, 100, 10)).toBe(2);
    expect(repeatCount(125, 100, 10)).toBe(4);
  });
});

describe('HeldRepeat', () => {
  it('fires on the press and not again before the delay', () => {
    const r = new HeldRepeat(DIRS);
    expect(r.update(DOWN, 1000)).toBe(DOWN);
    expect(r.update(DOWN, 1016)).toBe(0);
    expect(r.update(DOWN, 1000 + REPEAT_DELAY_MS - 1)).toBe(0);
  });

  it('repeats after the delay and then every interval', () => {
    const r = new HeldRepeat(DIRS);
    r.update(DOWN, 0);
    expect(r.update(DOWN, 350)).toBe(DOWN);
    expect(r.update(DOWN, 400)).toBe(0);
    expect(r.update(DOWN, 440)).toBe(DOWN);
    expect(r.update(DOWN, 530)).toBe(DOWN);
    // A second of holding at 60 fps: the press, then the repeats from 350 ms on.
    const q = new HeldRepeat(DIRS);
    expect(fires(q, DOWN, 0, 1000, DOWN)).toBe(1 + 1 + Math.floor((1000 - 350) / 90));
  });

  it('starts again from the press after a release', () => {
    const r = new HeldRepeat(DIRS);
    r.update(DOWN, 0);
    r.update(DOWN, 500);
    expect(r.update(0, 520)).toBe(0);
    expect(r.update(DOWN, 540)).toBe(DOWN);
    expect(r.update(DOWN, 540 + 349)).toBe(0);
    expect(r.update(DOWN, 540 + 350)).toBe(DOWN);
  });

  it('repeats several directions on their own clocks', () => {
    const r = new HeldRepeat(DIRS);
    expect(r.update(DOWN, 0)).toBe(DOWN);
    expect(r.update(DOWN | UP, 200)).toBe(UP);
    expect(r.update(DOWN | UP, 350)).toBe(DOWN);
    expect(r.update(DOWN | UP, 400)).toBe(0);
    // Up reaches its delay 350 ms after its own press, at 550.
    expect(r.update(DOWN | UP, 549) & UP).toBe(0);
    expect(r.update(DOWN | UP, 550) & UP).toBe(UP);
    expect(r.update(UP, 560)).toBe(0);
  });

  it('ignores bits outside the mask', () => {
    const r = new HeldRepeat(DIRS);
    expect(r.update(JUMP, 0)).toBe(0);
    expect(r.update(JUMP | DOWN, 10)).toBe(DOWN);
    expect(r.update(JUMP | DOWN, 1000)).toBe(DOWN);
  });

  it('fires at most once on a slow frame', () => {
    const r = new HeldRepeat(DIRS);
    r.update(DOWN, 0);
    expect(r.update(DOWN, 2000)).toBe(DOWN);
    expect(r.update(DOWN, 2016)).toBe(0);
  });

  it('makes a direction held across a screen change wait for a release', () => {
    const r = new HeldRepeat(DIRS);
    r.update(DOWN, 0);
    r.hold(DOWN);
    expect(fires(r, DOWN, 16, 2000, DOWN)).toBe(0);
    expect(r.update(0, 2016)).toBe(0);
    expect(r.update(DOWN, 2032)).toBe(DOWN);
  });

  it('holds a direction it had not seen yet as well', () => {
    const r = new HeldRepeat(DIRS);
    r.hold(UP);
    expect(r.update(UP, 0)).toBe(0);
    expect(r.update(UP | DOWN, 10)).toBe(DOWN);
  });
});
