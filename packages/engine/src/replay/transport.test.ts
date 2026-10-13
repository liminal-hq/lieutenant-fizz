// Tests for the replay transport: how frame time becomes ticks at each speed, paused or playing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SPEEDS, Transport } from './transport';

const STEP = 1 / 60;

/** The ticks run by one `advance` of `dt` seconds. */
function ticksFor(t: Transport, dt: number): number {
  let n = 0;
  t.advance(dt, () => {
    n += 1;
  });
  return n;
}

describe('Transport', () => {
  it('runs no ticks while paused, and one second of real time is sixty ticks while playing', () => {
    const t = new Transport();
    expect(ticksFor(t, 0.1)).toBe(0);
    t.play();
    let total = 0;
    for (let i = 0; i < 60; i++) total += ticksFor(t, STEP);
    expect(total).toBe(60);
  });

  it('scales by the speed: half, double and four times', () => {
    const run = (speed: (typeof SPEEDS)[number]): number => {
      const t = new Transport();
      t.setSpeed(speed);
      t.play();
      let total = 0;
      for (let i = 0; i < 120; i++) total += ticksFor(t, STEP);
      return total;
    };
    expect(run(0.5)).toBe(60);
    expect(run(1)).toBe(120);
    expect(run(2)).toBe(240);
    expect(run(4)).toBe(480);
  });

  it('cycles through the speeds and wraps from the fastest to the slowest', () => {
    const t = new Transport();
    expect(t.cycleSpeed()).toBe(2);
    expect(t.cycleSpeed()).toBe(4);
    expect(t.cycleSpeed()).toBe(0.5);
    expect(t.cycleSpeed()).toBe(1);
  });

  it('runs exactly the single steps asked for while paused, and ignores them while playing', () => {
    const t = new Transport();
    t.stepOnce();
    t.stepOnce();
    expect(ticksFor(t, 0)).toBe(2);
    expect(ticksFor(t, 0)).toBe(0);
    t.play();
    t.stepOnce();
    expect(ticksFor(t, 0)).toBe(0);
  });

  it('caps what a stalled frame owes, so a long pause in the page does not rush', () => {
    const t = new Transport();
    t.play();
    expect(ticksFor(t, 10)).toBeLessThanOrEqual(15);
  });

  it('draws the latest tick when paused, and a fraction between ticks while playing', () => {
    const t = new Transport();
    expect(t.advance(0.01, () => {})).toBe(1);
    t.play();
    const alpha = t.advance(STEP * 1.5, () => {});
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it('toggles and forgets time owed on reset', () => {
    const t = new Transport();
    expect(t.toggle()).toBe(true);
    expect(t.toggle()).toBe(false);
    t.play();
    t.advance(STEP * 0.9, () => {});
    t.reset();
    expect(ticksFor(t, STEP * 0.2)).toBe(0);
  });
});
