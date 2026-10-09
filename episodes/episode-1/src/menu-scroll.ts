// The maths of a scrolling menu list: its visible window, the cues for hidden rows, keeping the selected row in view and telling a tap from a drag.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How far a finger may move, in CSS pixels, and still count as a tap on a row (more is a drag). */
export const TAP_SLOP = 12;

/** Whether a finger that went down and came up `dx` and `dy` pixels apart made a tap, not a drag. */
export function isTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP;
}

/**
 * The height to give a list that overflows its screen, so the list scrolls and the screen does not.
 * `natural` is the list's height with every row showing and `overflow` is how far the screen then runs
 * over its own height. Returns `null` when the list fits and needs no scrolling. The result is never
 * under `floor` (what the head, Back button and controls leave must not squeeze it to nothing), and
 * never over `natural`.
 */
export function menuViewport(natural: number, overflow: number, floor: number): number | null {
  if (overflow <= 0 || natural <= 0) return null;
  return Math.min(natural, Math.max(floor, natural - overflow));
}

/** The furthest a list of `content` px scrolls inside a viewport `viewport` px tall. */
export const maxScroll = (viewport: number, content: number): number =>
  Math.max(0, content - viewport);

/** The part of a list a viewport shows: from `top` to `bottom`, in the list's own pixels. */
export function visibleWindow(
  scrollTop: number,
  viewport: number,
): { top: number; bottom: number } {
  return { top: scrollTop, bottom: scrollTop + viewport };
}

/** Whether a row (`rowTop` px down the list, `rowHeight` tall) is wholly inside the viewport. */
export function rowVisible(
  rowTop: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  slack = 0.5,
): boolean {
  const w = visibleWindow(scrollTop, viewport);
  return rowTop >= w.top - slack && rowTop + rowHeight <= w.bottom + slack;
}

/** Which "more rows" cues show: one for each direction in which part of the list is out of view. */
export interface ScrollCues {
  above: boolean;
  below: boolean;
}

/** The cues for a list scrolled to `scrollTop`; a pixel of rounding is not "more". */
export function scrollCues(scrollTop: number, viewport: number, content: number): ScrollCues {
  if (content <= viewport + 1) return { above: false, below: false };
  return {
    above: scrollTop > 1,
    below: scrollTop + viewport < content - 1,
  };
}

/** Where one row of a list sits, in the list's own pixels: `top` down from the list's start. */
export interface RowBox {
  top: number;
  height: number;
}

/** The fewest rows a scrolling list shows at once. */
export const MIN_ROWS = 2;

/**
 * The height of a scrolling list that shows only whole rows: the most rows from the first that fit in
 * `view` (never fewer than `minRows`), cut at the end of the last of them. What `view` has over is left
 * for the screen to spend as spacing, never as a row shown half. Returns `view` itself when it already
 * holds every row, and 0 for an empty list.
 */
export function snapViewport(rows: readonly RowBox[], view: number, minRows = MIN_ROWS): number {
  const first = rows[0];
  if (!first) return 0;
  const end = (i: number): number => rows[i]!.top + rows[i]!.height - first.top;
  let fit = 0;
  while (fit < rows.length && end(fit) <= view + 0.01) fit++;
  const shown = Math.min(rows.length, Math.max(fit, minRows));
  return shown >= rows.length ? view : end(shown - 1);
}

/** The least height of a cue strip, in CSS pixels: room for the chevron drawn at one CSS pixel per art pixel. */
export const MIN_STRIP = 10;

/** How a scrolling list sits in the height it is given: the list's own height and the strip above and below it. */
export interface StripLayout {
  /** The list's height: a whole number of rows. */
  view: number;
  /** The height of the cue strip reserved above the list and again below it. */
  strip: number;
}

/**
 * Lays a scrolling list out in `avail` px, reserving a cue strip of `want` px above and below it (about
 * half a row). The pixels whole-row snapping already frees pay for the strips first, so they cost no
 * row where the leftover can hold them; a strip shrinks towards `minStrip` before a row is dropped, and a
 * row is dropped only when even two minimum strips do not fit beside the rows left. Never fewer than
 * `minRows` rows. Returns `view` as `avail` and no strip for a list that already fits.
 */
export function stripLayout(
  rows: readonly RowBox[],
  avail: number,
  want: number,
  minStrip = MIN_STRIP,
  minRows = MIN_ROWS,
): StripLayout {
  const first = rows[0];
  if (!first) return { view: 0, strip: 0 };
  const end = (n: number): number => rows[n - 1]!.top + rows[n - 1]!.height - first.top;
  let fit = 0;
  while (fit < rows.length && end(fit + 1) <= avail + 0.01) fit++;
  if (fit >= rows.length) return { view: avail, strip: 0 };
  const least = Math.min(minRows, rows.length);
  for (let n = Math.max(fit, least); n > least; n--) {
    const strip = Math.min(want, Math.floor((avail - end(n)) / 2));
    if (strip >= minStrip) return { view: end(n), strip };
  }
  return {
    view: end(least),
    strip: Math.max(minStrip, Math.min(want, Math.floor((avail - end(least)) / 2))),
  };
}

/**
 * The size, in CSS pixels per art pixel, to draw the chevron in a strip `strip` px tall: the largest
 * whole scale up to `max` (the menu's own pixel size) at which the chevron and the art pixel it steps
 * outward while it moves both stay inside the strip, and never under one.
 */
export function chevronScale(strip: number, max: number): number {
  const art = CHEVRON_SIZE.height + 2;
  return Math.max(1, Math.min(Math.floor(max), Math.floor(strip / art)));
}

/**
 * The scroll offset that puts a whole row at the top edge, nearest to `scrollTop`: a row top, or the
 * furthest the list scrolls (`limit`) when that is nearer. An exact tie goes to the earlier offset.
 */
export function snapScroll(rows: readonly RowBox[], scrollTop: number, limit: number): number {
  const stops = [...rows.map((r) => r.top).filter((t) => t < limit), Math.max(0, limit)];
  let best = stops[0] ?? 0;
  for (const s of stops) if (Math.abs(s - scrollTop) < Math.abs(best - scrollTop)) best = s;
  return Math.max(0, best);
}

/**
 * The scroll offset that brings row `index` wholly into view with the window on a row boundary, or the
 * boundary `scrollTop` already snaps to when the row is in view. A row above moves to the top edge and
 * a row below moves in from the bottom by the fewest rows, though never past where the list scrolls.
 */
export function revealRow(
  rows: readonly RowBox[],
  index: number,
  scrollTop: number,
  viewport: number,
  content: number,
): number {
  const limit = maxScroll(viewport, content);
  const at = snapScroll(rows, scrollTop, limit);
  const row = rows[index];
  if (!row) return at;
  if (row.top < at) return snapScroll(rows, row.top, limit);
  if (row.top + row.height <= at + viewport + 0.01) return at;
  const stops = [...rows.map((r) => r.top).filter((t) => t < limit), limit].sort((a, b) => a - b);
  return stops.find((s) => s + viewport + 0.01 >= row.top + row.height) ?? limit;
}

/** The "more rows below" chevron, one character per art pixel (`#` is the chevron, drawn with an outline). */
const CHEVRON = ['##.....##', '.##...##.', '..##.##..', '...###...', '....#...'];

/** The chevron's size in art pixels, outline included; each art pixel is drawn `--lf-n` CSS pixels wide. */
export const CHEVRON_SIZE = { width: CHEVRON[0]!.length + 2, height: CHEVRON.length + 2 } as const;

/**
 * The chevron as an SVG document (pointing down; the "more above" cue flips it): `ink` pixels with a
 * one-pixel `edge` all round, so it reads over a dark scrim and over the orange selection plate alike.
 */
export function chevronSvg(ink: string, edge: string): string {
  const ink_: [number, number][] = [];
  CHEVRON.forEach((row, y) => [...row].forEach((c, x) => c === '#' && ink_.push([x + 1, y + 1])));
  const inked = new Set(ink_.map(([x, y]) => `${x},${y}`));
  const edged = new Set<string>();
  for (const [x, y] of ink_) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (!inked.has(k)) edged.add(k);
      }
    }
  }
  const rects = (keys: Iterable<string>, fill: string): string =>
    [...keys]
      .map((k) => {
        const [x, y] = k.split(',');
        return `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
      })
      .join('');
  const { width, height } = CHEVRON_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects(edged, edge)}${rects(inked, ink)}</svg>`;
}
