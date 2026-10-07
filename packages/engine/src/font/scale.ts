// Whole-number pixel scales for Fizz text, chosen from the viewport, and word wrapping by columns.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Smallest scale: each glyph pixel is two CSS pixels. Body text never goes below it. */
export const MIN_SCALE = 2;
/** Largest scale for text. */
export const MAX_SCALE = 6;
/** Rows in a glyph cell, so `font-size` is `CELL * n` for a scale of `n`. */
export const CELL = 11;
/** Average advance in glyph pixels, used to turn a width into a column count. */
export const AVERAGE_ADVANCE = 6;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The item scale `n` for a viewport height: 2 under 480 px, 3 up to 900 px, 4 above. Large text adds
 * one. The result is always a whole number from 2 to 6.
 */
export function pixelScale(viewportHeight: number, large = false): number {
  const base = viewportHeight >= 900 ? 4 : viewportHeight >= 480 ? 3 : 2;
  return clamp(base + (large ? 1 : 0), MIN_SCALE, MAX_SCALE);
}

/** The scales for each kind of text, all whole numbers. */
export interface ScaleSteps {
  /** Menu items, HUD numbers and other main text. */
  item: number;
  /** Values, descriptions and body text: one step below the items, never under 2. */
  small: number;
  /** Screen headings: one step above the items, never over 6. */
  head: number;
  /** Hints, notes and labels: always 2. */
  hint: number;
  /** Menu bullet size multiplier: how many CSS pixels each pixel of the 16-pixel sprite covers. */
  bullet: number;
}

/** Derives every text scale from the item scale. */
export function scaleSteps(item: number): ScaleSteps {
  return {
    item,
    small: Math.max(MIN_SCALE, item - 1),
    head: Math.min(MAX_SCALE, item + 1),
    hint: MIN_SCALE,
    bullet: Math.max(2, Math.ceil(item / 2)),
  };
}

/** Whether the wordmark breaks onto two lines at this viewport width. */
export const wordmarkTwoLines = (viewportWidth: number): boolean => viewportWidth < 720;

/**
 * The wordmark scale: as large as fits the width beside the side padding, up to the item scale plus
 * three and never more than 6. "Lieutenant Fizz" is about 102 glyph pixels wide on one line, and
 * "Lieutenant" about 66 on two.
 */
export function wordmarkScale(viewportWidth: number, sidePad: number, item: number): number {
  const avail = viewportWidth - 2 * sidePad;
  const wide = wordmarkTwoLines(viewportWidth) ? 66 : 102;
  return clamp(Math.floor(avail / wide), MIN_SCALE, Math.min(item + 3, MAX_SCALE));
}

/** Side padding in CSS pixels: 7% of the width, from 24 to 104. */
export const sidePadding = (viewportWidth: number): number =>
  clamp(Math.round(viewportWidth * 0.07), 24, 104);

/** Top and bottom padding in CSS pixels: 6% of the height, from 24 to 64. */
export const verticalPadding = (viewportHeight: number): number =>
  clamp(Math.round(viewportHeight * 0.06), 24, 64);

/**
 * How many characters of body text fit on a line `widthPx` wide at scale `n`, kept between `min` and
 * `max` so lines are neither cramped nor too long to read.
 */
export function wrapColumns(widthPx: number, n: number, min = 20, max = 56): number {
  return clamp(Math.floor(widthPx / (AVERAGE_ADVANCE * n)), min, max);
}

/** Wraps text at word boundaries into lines of at most `columns` characters. Long words stay whole. */
export function wrapText(text: string, columns: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > columns) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
