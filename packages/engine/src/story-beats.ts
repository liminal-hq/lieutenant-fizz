// The beat cursor behind the letterboxed story screens: a scene holds one background and its text arrives a page at a time.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  commonPrefix,
  pageOfBeat,
  paginate,
  singleBeats,
  type PageFit,
  type Pages,
} from './story-pages';

/**
 * A scene: the place it happens, and its text split into beats. The beats are the author's break
 * points; the screen shows a page at a time, as many consecutive beats as fit (see `story-pages.ts`).
 */
export interface BeatScene {
  place: string;
  beats: readonly string[];
  /** Beats that always start a page, such as the one a cue in the art waits for. */
  breaks?: readonly number[];
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
  /** The first beat of the page showing. */
  beat: number;
  /** The page within the scene, and how many pages the scene has at the current width. */
  page: number;
  pageCount: number;
  place: string;
  /** The page's text: its beats joined with a single space. */
  text: string;
  /** The typed part of the page, and the rest (kept in the layout but not shown). */
  shown: string;
  hidden: string;
  /** The page is fully typed, so the next press advances. */
  done: boolean;
  /** The last page of its scene. */
  sceneEnd: boolean;
  /** The last page of the last scene. */
  last: boolean;
  /** Progress by scene: a filled dot for each scene reached and an open one for each to come. */
  pips: string;
  /** What a screen reader hears when the page starts: the whole page, led by the place when the scene changes. */
  announcement: string;
}

/** The typewriter speed the story screens have always used. */
export const BEAT_CHARS_PER_SECOND = 83;

/**
 * The pure state behind a letterboxed story sequence. It holds the scene and page the player is on and
 * how much of the page is typed. A page is as many consecutive beats of the scene as the host says
 * fit (`setFit`); with no fit, every beat is a page. A press while the page is typing completes it;
 * the next press moves to the next page, then the next scene. The host owns the art and calls `tick`
 * with frame times, so the sequence needs no clock or DOM of its own.
 */
export class BeatCursor {
  private scenes: readonly BeatScene[];
  private readonly cps: number;
  private reduced: boolean;
  private fit: PageFit | null = null;
  private pages: Pages[] = [];
  private sceneIdx = 0;
  private pageIdx = 0;
  private typedChars = 0;

  constructor(scenes: readonly BeatScene[], options: BeatOptions = {}) {
    this.scenes = scenes;
    this.cps = options.charsPerSecond ?? BEAT_CHARS_PER_SECOND;
    this.reduced = options.reduced ?? false;
    this.start();
  }

  /**
   * Begins again at the first page, of `scenes` when given. `fit` chooses how pages are packed (`null`
   * for a page per beat); leaving it out keeps the fit the cursor already has.
   */
  start(scenes?: readonly BeatScene[], fit?: PageFit | null): void {
    if (scenes) this.scenes = scenes;
    if (fit !== undefined) this.fit = fit;
    this.pages = this.pack();
    this.sceneIdx = 0;
    this.pageIdx = 0;
    this.typedChars = this.reduced ? this.text.length : 0;
  }

  /**
   * Packs the pages again for a new fit (the text box changed size, or the font arrived), keeping the
   * player's place: the page that holds the first beat of the page they were on. The typed text is kept
   * as far as the new page starts the same way, so a page that is already complete and comes out the
   * same is not typed again, and a page that grew keeps what was shown and types the rest.
   */
  setFit(fit: PageFit | null): void {
    const beat = this.beat;
    const text = this.text;
    const typed = this.typedChars;
    this.fit = fit;
    this.pages = this.pack();
    this.pageIdx = pageOfBeat(this.pages[this.sceneIdx]?.starts ?? [], beat);
    const now = this.text;
    if (this.reduced) this.typedChars = now.length;
    else if (now !== text) this.typedChars = Math.min(typed, commonPrefix(text, now));
  }

  /** Jumps to a page, for tests and debugging; the page starts untyped. */
  seek(scene: number, page = 0): void {
    this.sceneIdx = Math.max(0, Math.min(scene, this.scenes.length - 1));
    const count = this.pages[this.sceneIdx]?.texts.length ?? 1;
    this.pageIdx = Math.max(0, Math.min(page, count - 1));
    this.reveal();
  }

  get scene(): number {
    return this.sceneIdx;
  }

  /** The first beat of the page showing. */
  get beat(): number {
    return this.pages[this.sceneIdx]?.starts[this.pageIdx] ?? 0;
  }

  get page(): number {
    return this.pageIdx;
  }

  /** Whole characters of the current page that are showing. */
  get typed(): number {
    return Math.min(this.text.length, Math.floor(this.typedChars));
  }

  get done(): boolean {
    return this.typed >= this.text.length;
  }

  /** Switches reduced motion; turning it on finishes the page being typed. */
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.typedChars = this.text.length;
  }

  /** The number of beats in every scene, in order. */
  get beatCounts(): number[] {
    return this.scenes.map((s) => s.beats.length);
  }

  /** The number of pages in every scene at the current fit, in order. */
  get pageCounts(): number[] {
    return this.pages.map((p) => p.texts.length);
  }

  /** Every page, by scene, for tests and the debug state. */
  get allPages(): readonly Pages[] {
    return this.pages;
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
   * One press of Continue, Enter, Jump or a tap: completes the page if it is still typing, otherwise
   * moves to the next page (`beat`), or to the first page of the next scene (`scene`). On the last
   * page of the last scene it returns `end` and stays where it is, for the host to leave the sequence.
   */
  press(): BeatPress {
    if (!this.done) {
      this.typedChars = this.text.length;
      return 'complete';
    }
    if (this.pageIdx + 1 < this.pageCount) {
      this.pageIdx++;
      this.reveal();
      return 'beat';
    }
    if (this.sceneIdx + 1 < this.scenes.length) {
      this.sceneIdx++;
      this.pageIdx = 0;
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
    const sceneEnd = !scene || this.pageIdx >= this.pageCount - 1;
    const place = scene?.place ?? '';
    return {
      scene: this.sceneIdx,
      beat: this.beat,
      page: this.pageIdx,
      pageCount: this.pageCount,
      place,
      text,
      shown: text.slice(0, typed),
      hidden: text.slice(typed),
      done: typed >= text.length,
      sceneEnd,
      last: sceneEnd && this.sceneIdx >= total - 1,
      pips: '●'.repeat(this.sceneIdx + 1) + '○'.repeat(Math.max(0, total - this.sceneIdx - 1)),
      announcement: this.pageIdx === 0 && place ? `${place}. ${text}` : text,
    };
  }

  private get pageCount(): number {
    return this.pages[this.sceneIdx]?.texts.length ?? 0;
  }

  private get text(): string {
    return this.pages[this.sceneIdx]?.texts[this.pageIdx] ?? '';
  }

  private pack(): Pages[] {
    return this.fit ? paginate(this.scenes, this.fit) : singleBeats(this.scenes);
  }

  private reveal(): void {
    this.typedChars = this.reduced ? this.text.length : 0;
  }
}
