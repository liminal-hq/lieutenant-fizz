// Runtime page packing for the story screens: consecutive beats of a scene are joined into a page for as many as the text box holds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * The pure part of packing. The beats are the author's break points; a page is as many consecutive
 * beats of one scene as fit the text box, joined with a single space (a beat ends with a comma or a
 * dash where its sentence goes on, so a join reads naturally). Whether a text fits is the host's
 * business, because only the browser can measure it, so everything here takes a `fits` predicate.
 */

/** Whether a page's text fits the text box at its current width. */
export type Fits = (text: string) => boolean;

/** How the host decides what fits. */
export interface PageFit {
  fits: Fits;
  /**
   * For the page that ends the whole sequence only, when its text box is narrower (the button that
   * leaves the intro is a word, not an arrow). Omitted when the last page has the same room.
   */
  fitsLast?: Fits;
}

/** A scene's text cut into pages. */
export interface Pages {
  /** The text of each page: its beats joined with a single space. */
  texts: string[];
  /** The index of the first beat of each page. */
  starts: number[];
  /** Whether a page is too long for the text box even though it is a single beat, so packing cannot help. */
  over: boolean[];
}

/** A scene as far as packing needs to know it. */
export interface PackScene {
  beats: readonly string[];
  /** Beats that always start a page, such as the one a cue waits for (see `LIFTOFF_BEAT`). */
  breaks?: readonly number[];
}

/**
 * Packs beats greedily: a page takes the next beat while the joined text still fits, and a beat in
 * `breaks` always starts a new page. A single beat that does not fit stays a page of its own and is
 * flagged in `over`.
 */
export function packBeats(
  beats: readonly string[],
  fits: Fits,
  breaks: readonly number[] = [],
  from = 0,
): Pages {
  const texts: string[] = [];
  const starts: number[] = [];
  const over: boolean[] = [];
  let i = from;
  while (i < beats.length) {
    let text = beats[i] ?? '';
    const start = i;
    i++;
    while (i < beats.length && !breaks.includes(i)) {
      const joined = `${text} ${beats[i]}`;
      if (!fits(joined)) break;
      text = joined;
      i++;
    }
    texts.push(text);
    starts.push(start);
    over.push(i - start === 1 && !fits(text));
  }
  return { texts, starts, over };
}

/**
 * Packs every scene. The last page of the last scene is packed again with `fitsLast`, when there is
 * one, so the page that is followed by the narrower leaving button still fits beside it.
 */
export function paginate(scenes: readonly PackScene[], fit: PageFit): Pages[] {
  const out = scenes.map((s) => packBeats(s.beats, fit.fits, s.breaks));
  const lastScene = scenes.at(-1);
  const last = out.at(-1);
  if (fit.fitsLast && lastScene && last && last.starts.length > 0) {
    const tail = last.starts.length - 1;
    const repacked = packBeats(lastScene.beats, fit.fitsLast, lastScene.breaks, last.starts[tail]);
    last.texts.splice(tail, 1, ...repacked.texts);
    last.starts.splice(tail, 1, ...repacked.starts);
    last.over.splice(tail, 1, ...repacked.over);
  }
  return out;
}

/** One page for each beat: what the story is before anything is measured. */
export function singleBeats(scenes: readonly PackScene[]): Pages[] {
  return scenes.map((s) => ({
    texts: [...s.beats],
    starts: s.beats.map((_, i) => i),
    over: s.beats.map(() => false),
  }));
}

/** The page that holds a beat: the last page that starts at or before it. */
export function pageOfBeat(starts: readonly number[], beat: number): number {
  let page = 0;
  for (let i = 0; i < starts.length; i++) if ((starts[i] ?? 0) <= beat) page = i;
  return page;
}

/** The number of characters two texts share at the start. */
export function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Presses that move on from the first page to the end of the sequence: one a page. */
export function tapCount(pages: readonly Pages[]): number {
  return pages.reduce((n, p) => n + p.texts.length, 0);
}

export interface AllowedLinesInput {
  /** The height of the screen the strip sits on. */
  height: number;
  /** The height of one line of text. */
  lineHeight: number;
  /** The strip's padding above and below its content. */
  chrome: number;
  /** The least the content takes whatever the text does: the button beside it. */
  floor?: number;
  /** The most of the screen the strip may take, as a share of `height`. */
  maxShare?: number;
  /** The most lines a page may take. */
  most?: number;
  /** The fewest lines a page is allowed, even when they do not fit the share. */
  least?: number;
}

/**
 * The most lines a page may take on a phone: the largest count, up to `most`, for which the strip
 * (its padding plus the taller of the text and the button) stays within `maxShare` of the screen,
 * and never under `least`. It is worked out from measured sizes, never from a device name.
 */
export function allowedLines(o: AllowedLinesInput): number {
  const floor = o.floor ?? 0;
  const maxShare = o.maxShare ?? 0.3;
  const most = o.most ?? 3;
  const least = o.least ?? 2;
  for (let n = most; n > least; n--) {
    if (o.chrome + Math.max(n * o.lineHeight, floor) <= maxShare * o.height + 0.01) return n;
  }
  return least;
}
