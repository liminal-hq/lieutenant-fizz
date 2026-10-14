// Tests for following Ben's fizz bubbles from tick to tick.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { FizzTracker } from './fizz';

describe('FizzTracker', () => {
  it('follows one bubble, and ends it when it is no longer there', () => {
    const t = new FizzTracker();
    t.observe(10, [{ x: 5, y: 3 }]);
    t.observe(11, [{ x: 5.27, y: 3 }]);
    t.observe(12, [{ x: 5.53, y: 3 }]);
    expect(t.fizz).toHaveLength(1);
    expect(t.fizz[0]).toMatchObject({ n: 0, from: 10, ended: false });
    expect(t.fizz[0]!.path.map((p) => p.t)).toEqual([10, 11, 12]);
    t.observe(13, []);
    expect(t.fizz[0]!.ended).toBe(true);
  });

  it('keeps two bubbles apart, in the order they were fired', () => {
    const t = new FizzTracker();
    t.observe(1, [{ x: 2, y: 2 }]);
    t.observe(2, [
      { x: 2.27, y: 2 },
      { x: 4, y: 2 },
    ]);
    t.observe(3, [
      { x: 4.27, y: 2 },
      { x: 2.53, y: 2 },
    ]);
    expect(t.fizz.map((f) => f.n)).toEqual([0, 1]);
    expect(t.fizz[0]!.path.at(-1)).toMatchObject({ x: 2.53 });
    expect(t.fizz[1]!.path.at(-1)).toMatchObject({ x: 4.27 });
  });

  it('ends a bubble that vanishes, and starts a new fizz for one that appears far away', () => {
    const t = new FizzTracker();
    t.observe(1, [{ x: 10, y: 4 }]);
    t.observe(2, [{ x: 10, y: 4.27 }]);
    t.observe(3, [{ x: 1, y: 1 }]);
    expect(t.fizz).toHaveLength(2);
    expect(t.fizz[0]).toMatchObject({ ended: true });
    expect(t.fizz[1]).toMatchObject({ n: 1, from: 3, ended: false });
  });

  it('starts over on a reset', () => {
    const t = new FizzTracker();
    t.observe(1, [{ x: 1, y: 1 }]);
    t.reset();
    expect(t.fizz).toEqual([]);
    t.observe(5, [{ x: 8, y: 8 }]);
    expect(t.fizz[0]).toMatchObject({ n: 0, from: 5 });
  });
});
