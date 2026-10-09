// The beat cursor behind the letterboxed story screens: a scene holds one background and its text arrives a beat at a time.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A scene: the place it happens, and its text split into beats that are each read before the next. */
export interface BeatScene {
  place: string;
  beats: readonly string[];
}

/** What one press did. `end` means the last beat of the last scene was already complete. */
export type BeatPress = 'complete' | 'beat' | 'scene' | 'end';

export interface BeatOptions {
  /** Characters typed per second. */
  charsPerSecond?: number;
  /** Reveals each beat whole, as soon as it starts, for players who ask for reduced motion. */
  reduced?: boolean;
}

/** What the screen draws for the current beat. */
export interface BeatView {
  scene: number;
  beat: number;
  place: string;
  text: string;
  /** The typed part of the beat, and the rest (kept in the layout but not shown). */
  shown: string;
  hidden: string;
  /** The beat is fully typed, so the next press advances. */
  done: boolean;
  /** The last beat of its scene. */
  sceneEnd: boolean;
  /** The last beat of the last scene. */
  last: boolean;
  /** Progress by scene: a filled dot for each scene reached and an open one for each to come. */
  pips: string;
  /** What a screen reader hears when the beat starts: the whole beat, led by the place when the scene changes. */
  announcement: string;
}

/** The typewriter speed the story screens have always used. */
export const BEAT_CHARS_PER_SECOND = 83;

/**
 * The pure state behind a letterboxed story sequence. It holds the scene and beat the player is on and
 * how much of the beat is typed. A press while the beat is typing completes it; the next press moves
 * to the next beat, then the next scene. The host owns the art and calls `tick` with frame times, so
 * the sequence needs no clock or DOM of its own.
 */
export class BeatCursor {
  private scenes: readonly BeatScene[];
  private readonly cps: number;
  private reduced: boolean;
  private sceneIdx = 0;
  private beatIdx = 0;
  private typedChars = 0;

  constructor(scenes: readonly BeatScene[], options: BeatOptions = {}) {
    this.scenes = scenes;
    this.cps = options.charsPerSecond ?? BEAT_CHARS_PER_SECOND;
    this.reduced = options.reduced ?? false;
    this.start();
  }

  /** Begins again at the first beat, of `scenes` when given. */
  start(scenes?: readonly BeatScene[]): void {
    if (scenes) this.scenes = scenes;
    this.sceneIdx = 0;
    this.beatIdx = 0;
    this.typedChars = this.reduced ? this.text.length : 0;
  }

  get scene(): number {
    return this.sceneIdx;
  }

  get beat(): number {
    return this.beatIdx;
  }

  /** Whole characters of the current beat that are showing. */
  get typed(): number {
    return Math.min(this.text.length, Math.floor(this.typedChars));
  }

  get done(): boolean {
    return this.typed >= this.text.length;
  }

  /** Switches reduced motion; turning it on finishes the beat being typed. */
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.typedChars = this.text.length;
  }

  /** The number of beats in every scene, in order. */
  get beatCounts(): number[] {
    return this.scenes.map((s) => s.beats.length);
  }

  /**
   * Advances the typewriter by `dt` seconds. Returns true when the number of whole characters showing
   * changed, which is when the screen needs to redraw.
   */
  tick(dt: number): boolean {
    const len = this.text.length;
    if (this.typedChars >= len) return false;
    const before = this.typed;
    this.typedChars = this.reduced ? len : Math.min(len, this.typedChars + dt * this.cps);
    return this.typed !== before || this.typedChars >= len;
  }

  /**
   * One press of Continue, Enter, Jump or a tap: completes the beat if it is still typing, otherwise
   * moves to the next beat (`beat`), or to the first beat of the next scene (`scene`). On the last
   * beat of the last scene it returns `end` and stays where it is, for the host to leave the sequence.
   */
  press(): BeatPress {
    if (!this.done) {
      this.typedChars = this.text.length;
      return 'complete';
    }
    const scene = this.scenes[this.sceneIdx];
    if (scene && this.beatIdx + 1 < scene.beats.length) {
      this.beatIdx++;
      this.reveal();
      return 'beat';
    }
    if (this.sceneIdx + 1 < this.scenes.length) {
      this.sceneIdx++;
      this.beatIdx = 0;
      this.reveal();
      return 'scene';
    }
    return 'end';
  }

  view(): BeatView {
    const scene = this.scenes[this.sceneIdx];
    const text = this.text;
    const typed = this.typed;
    const total = this.scenes.length;
    const sceneEnd = !scene || this.beatIdx >= scene.beats.length - 1;
    const place = scene?.place ?? '';
    return {
      scene: this.sceneIdx,
      beat: this.beatIdx,
      place,
      text,
      shown: text.slice(0, typed),
      hidden: text.slice(typed),
      done: typed >= text.length,
      sceneEnd,
      last: sceneEnd && this.sceneIdx >= total - 1,
      pips: '●'.repeat(this.sceneIdx + 1) + '○'.repeat(Math.max(0, total - this.sceneIdx - 1)),
      announcement: this.beatIdx === 0 && place ? `${place}. ${text}` : text,
    };
  }

  private get text(): string {
    return this.scenes[this.sceneIdx]?.beats[this.beatIdx] ?? '';
  }

  private reveal(): void {
    this.typedChars = this.reduced ? this.text.length : 0;
  }
}
