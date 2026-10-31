// The opening titles' run: waiting for the first key, playing, and fading out when skipped.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { FADE_OUT_FROM, TITLES_SECONDS } from './titles';

/** What follows the titles: the title menu, or a new game's story. */
export type TitlesAfter = 'menu' | 'new';

/** How long a skip takes to fade to black, in seconds. */
export const LEAVE_SECONDS = 0.35;

/** A second press this soon after the one before is ignored, so the key that starts the titles does not also skip them. */
export const PRESS_GUARD_MS = 250;

/** The longest step the clock takes in one frame, so a stalled page does not jump the titles ahead. */
const MAX_STEP = 0.1;

/**
 * The opening titles as they play. A page opened on its own first waits at a gate for a key or a tap, which lets
 * the browser play sound; the launcher's New game has had its tap already and starts playing at once. Any key, tap
 * or button then fades the titles out, and they end by themselves after their passes.
 */
export class TitlesRun {
  /** Seconds into the titles. */
  time = 0;
  /** Seconds since a skip began, or null while the titles play on. */
  leaving: number | null = null;
  private waiting: boolean;
  private lastPress = Number.NEGATIVE_INFINITY;

  constructor(
    readonly after: TitlesAfter,
    gate: boolean,
    /** How many passes of the titles play in a row: one at the start, two when a title menu left alone brings them back. */
    readonly loops = 1,
  ) {
    this.waiting = gate;
  }

  /** Seconds into the pass on show, which the picture follows (the music loops by itself). */
  get moment(): number {
    return this.time % TITLES_SECONDS;
  }

  /** Whether the run is at the gate, waiting for the first key. */
  get atGate(): boolean {
    return this.waiting;
  }

  /**
   * Whether the titles' song should now be crossing into the next music: from the moment the picture starts to fade
   * out at the end of the last pass, or as soon as a skip begins. The sound fades with the picture, not after it.
   */
  get leavingSoon(): boolean {
    return (
      !this.waiting &&
      (this.leaving !== null || this.time >= TITLES_SECONDS * this.loops - FADE_OUT_FROM)
    );
  }

  /** Whether the titles' picture and music are on (not at the gate). */
  get playing(): boolean {
    return !this.waiting;
  }

  /** A key, tap or button at `now` (milliseconds): opens the gate, or starts the skip. */
  press(now: number): void {
    if (this.waiting) {
      this.waiting = false;
      this.time = 0;
      this.lastPress = now;
    } else if (now - this.lastPress >= PRESS_GUARD_MS && this.leaving === null) {
      this.leaving = 0;
      this.lastPress = now;
    }
  }

  /** Moves the clock on by `dt` seconds. Returns true once the titles are over. */
  advance(dt: number): boolean {
    if (this.waiting) return false;
    const step = Math.min(Math.max(dt, 0), MAX_STEP);
    if (this.leaving !== null) {
      this.leaving += step;
      return this.leaving >= LEAVE_SECONDS;
    }
    this.time += step;
    return this.time >= TITLES_SECONDS * this.loops;
  }

  /** How much black a skip has faded in, from 0 to 1. */
  get blackout(): number {
    return this.leaving === null ? 0 : Math.min(1, this.leaving / LEAVE_SECONDS);
  }
}

/** How long one pass of a Classic track of eight bars of four beats lasts, in seconds, at `bpm`. */
export const classicLoopSeconds = (bpm: number): number => (8 * 4 * 60) / bpm;

/**
 * How long the bare title menu may be left alone before the titles come back: two passes of its song, less the fade
 * out, as the DOS port waits. `loop` is how long one pass of the song that is playing lasts.
 */
export const idleSeconds = (loop: number): number => 2 * loop - LEAVE_SECONDS;
