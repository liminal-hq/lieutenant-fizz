// Auto-repeat for held menu directions: a press fires at once, then again after a delay and at an interval.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure logic with the time passed in, so it is unit-tested without a clock. It works on input bits,
// so a key, a gamepad button and a touch D-pad all repeat the same way.

/** How long a direction is held before it starts repeating, in milliseconds. */
export const REPEAT_DELAY_MS = 350;

/** The time between repeats once they start, in milliseconds. */
export const REPEAT_INTERVAL_MS = 90;

/**
 * How many times a press held for `heldMs` has fired, counting the press itself: 1 until the delay
 * runs out, then one more at the delay and one more each interval after it.
 */
export function repeatCount(
  heldMs: number,
  delay = REPEAT_DELAY_MS,
  interval = REPEAT_INTERVAL_MS,
): number {
  if (heldMs < delay) return 1;
  return 2 + Math.floor((heldMs - delay) / interval);
}

interface Held {
  since: number;
  fired: number;
  /** Held from before `hold` was called: it never fires until it is released and pressed again. */
  stale: boolean;
}

/**
 * Turns held bits into pulses: a bit fires on the frame it is pressed and then repeats while it stays
 * held. Only the bits in `mask` are tracked. Several bits repeat independently. A slow frame fires a
 * bit at most once, so a stall never jumps the cursor several rows.
 */
export class HeldRepeat {
  private readonly held = new Map<number, Held>();

  constructor(
    private readonly mask: number,
    private readonly delay = REPEAT_DELAY_MS,
    private readonly interval = REPEAT_INTERVAL_MS,
  ) {}

  /** The bits that fire at time `now` (milliseconds) given the bits held now. */
  update(bits: number, now: number): number {
    let out = 0;
    for (let bit = 1; bit <= this.mask; bit <<= 1) {
      if (!(this.mask & bit)) continue;
      const h = this.held.get(bit);
      if (!(bits & bit)) {
        this.held.delete(bit);
        continue;
      }
      if (!h) {
        this.held.set(bit, { since: now, fired: 1, stale: false });
        out |= bit;
        continue;
      }
      if (h.stale) continue;
      const due = repeatCount(now - h.since, this.delay, this.interval);
      if (due > h.fired) {
        h.fired = due;
        out |= bit;
      }
    }
    return out;
  }

  /**
   * Makes every bit held now wait for a release before it fires (a screen just changed, so a
   * direction held from before must not start moving the new menu).
   */
  hold(bits: number): void {
    for (let bit = 1; bit <= this.mask; bit <<= 1) {
      if (!(this.mask & bit) || !(bits & bit)) continue;
      this.held.set(bit, { since: 0, fired: 1, stale: true });
    }
  }
}
