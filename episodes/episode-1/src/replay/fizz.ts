// Follows Ben's fizz bubbles tick by tick, so a replay can draw where each one went.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A bubble as the sim reports it at one tick. */
export interface Bubble {
  x: number;
  y: number;
}

/** One bubble's flight: where it was each tick it was seen, from the tick after it was fired. */
export interface Fizz {
  /** Which bubble this is among the attempt's, from 0, in the order they were fired. */
  n: number;
  /** The tick it was first seen on. */
  from: number;
  path: { x: number; y: number; t: number }[];
  /** Whether it has gone: it hit something or ran out of reach. */
  ended: boolean;
}

/** The furthest a bubble moves in one tick (16 tiles a second at 60 ticks a second) with room to spare. */
const REACH = 0.5;

/** The most bubbles kept for an attempt, so a very long one cannot grow without end. */
const KEEP = 400;

/**
 * Matches each tick's bubbles to the ones seen the tick before. A bubble has no identity in the sim, but it moves
 * less than `REACH` in a tick, so the nearest unmatched one within reach is the same bubble. One that matches
 * nothing is newly fired; a fizz nothing matches is over.
 */
export class FizzTracker {
  readonly fizz: Fizz[] = [];
  private fired = 0;
  private live: Fizz[] = [];

  reset(): void {
    this.fizz.length = 0;
    this.fired = 0;
    this.live = [];
  }

  /** Takes the bubbles that are in flight after the sim's tick `t`. */
  observe(t: number, bubbles: readonly Bubble[]): void {
    const free = bubbles.map((b) => ({ ...b, taken: false }));
    const next: Fizz[] = [];
    for (const f of this.live) {
      const last = f.path[f.path.length - 1]!;
      let best = -1;
      let bestD = REACH * REACH;
      free.forEach((b, i) => {
        if (b.taken) return;
        const d = (b.x - last.x) ** 2 + (b.y - last.y) ** 2;
        if (d <= bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best < 0) {
        f.ended = true;
        continue;
      }
      free[best]!.taken = true;
      f.path.push({ x: free[best]!.x, y: free[best]!.y, t });
      next.push(f);
    }
    for (const b of free) {
      if (b.taken) continue;
      const f: Fizz = { n: this.fired, from: t, path: [{ x: b.x, y: b.y, t }], ended: false };
      this.fired += 1;
      if (this.fizz.length < KEEP) this.fizz.push(f);
      next.push(f);
    }
    this.live = next;
  }
}
