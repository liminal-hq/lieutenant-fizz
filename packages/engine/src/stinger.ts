// Post-credits stinger content types and the timing state machine for the scene.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What an episode supplies for its post-credits stinger. */
export interface StingerContent {
  /** Name typed under the figure. */
  name: string;
  /** Short place line above the typed text. */
  place: string;
  /** The line that is typed out. */
  text: string;
  /** Sprite name (in the episode's atlas) for the figure in the doorway. */
  sprite: string;
  /** Sound caption shown, and its effect played, when the sting lands. */
  caption: string;
}

/** Stages of the scene: black, the sting and a slit of light, the doorway, then name and line. */
export type StingerPhase = 'silence' | 'slit' | 'doorway' | 'line';

/** Seconds at which each stage begins. */
export const STINGER_TIMES = { slit: 1.2, doorway: 2.6, line: 4.6 } as const;

/** Typewriter speed in characters per second (matches the cinematic panels). */
export const STINGER_TYPE_RATE = 83;

/** What a press of Jump (or Enter) did. */
export type StingerAction = 'ignored' | 'finishTyping' | 'finish';

/**
 * The stinger timing, driven by injected frame times so tests and the shell share one clock-free
 * path. `tick` reports when the sting should sound, exactly once.
 */
export class StingerScene {
  private elapsed = 0;
  private chars = 0;
  private stung = false;
  private left = false;

  constructor(readonly content: StingerContent) {}

  get time(): number {
    return this.elapsed;
  }

  get phase(): StingerPhase {
    if (this.elapsed >= STINGER_TIMES.line) return 'line';
    if (this.elapsed >= STINGER_TIMES.doorway) return 'doorway';
    if (this.elapsed >= STINGER_TIMES.slit) return 'slit';
    return 'silence';
  }

  /** Characters of the line typed so far. */
  get typed(): number {
    return Math.min(this.content.text.length, Math.floor(this.chars));
  }

  /** True once the whole line is on screen. */
  get done(): boolean {
    return this.phase === 'line' && this.typed >= this.content.text.length;
  }

  get finished(): boolean {
    return this.left;
  }

  /** Advances by `dt` seconds. Returns true on the one tick where the sting should sound. */
  tick(dt: number): boolean {
    if (this.left) return false;
    const step = Math.max(0, dt);
    const before = this.elapsed;
    this.elapsed += step;
    if (this.elapsed > STINGER_TIMES.line) {
      this.chars += (this.elapsed - Math.max(before, STINGER_TIMES.line)) * STINGER_TYPE_RATE;
    }
    if (!this.stung && this.elapsed >= STINGER_TIMES.slit) {
      this.stung = true;
      return true;
    }
    return false;
  }

  /** Jump (or Enter): ignored until the line appears, then finishes the typing, then continues. */
  press(): StingerAction {
    if (this.phase !== 'line') return 'ignored';
    if (this.typed < this.content.text.length) {
      this.chars = this.content.text.length;
      return 'finishTyping';
    }
    this.left = true;
    return 'finish';
  }

  /** Esc or Start: leaves the scene at once. */
  skip(): void {
    this.left = true;
  }
}
