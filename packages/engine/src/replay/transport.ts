// Play, pause, speed and single steps for a replay: turns frame time into the fixed ticks to run.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { FixedStepper } from '../instances';

/** The speeds a replay can run at, as multiples of real time. */
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Decides how many fixed ticks a replay runs each frame. It knows nothing of the sim: the caller passes the
 * function that runs one tick. A paused replay runs none, except the single steps asked for.
 */
export class Transport {
  playing = false;
  speed: Speed = 1;

  private readonly stepper: FixedStepper;
  private once = 0;

  constructor(step = 1 / 60, maxCatchUp = 0.25) {
    this.stepper = new FixedStepper(step, maxCatchUp);
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
    this.stepper.reset();
  }

  /** Pauses a playing replay and plays a paused one; returns whether it is playing now. */
  toggle(): boolean {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
  }

  /** The next speed in the list, wrapping from the fastest to the slowest; returns it. */
  cycleSpeed(): Speed {
    const next = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length] ?? 1;
    this.speed = next;
    return next;
  }

  /** Asks for one tick on the next `advance` while paused (a playing replay ignores it). */
  stepOnce(): void {
    if (!this.playing) this.once += 1;
  }

  /** Forgets time owed, for after a seek, so the replay does not rush to catch up. */
  reset(): void {
    this.stepper.reset();
    this.once = 0;
  }

  /**
   * Advances by `dt` seconds of real time, calling `tick` once per fixed tick owed (scaled by the speed), and
   * returns the render alpha: how far between the last two ticks to draw. A paused replay draws its latest tick.
   */
  advance(dt: number, tick: () => void): number {
    if (!this.playing) {
      for (; this.once > 0; this.once -= 1) tick();
      return 1;
    }
    this.once = 0;
    return this.stepper.advance(dt * this.speed, tick);
  }
}
