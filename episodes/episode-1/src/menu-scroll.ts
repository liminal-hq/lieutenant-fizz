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

/**
 * The scroll offset that brings a row into view, or `scrollTop` itself when it already is. A row that
 * is cut at an edge, or beyond it, moves to `margin` px inside that edge (room for the cue drawn
 * there), though never past where the list can scroll.
 */
export function scrollToReveal(
  rowTop: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  content: number,
  margin = 0,
): number {
  const limit = maxScroll(viewport, content);
  let next = scrollTop;
  if (rowTop - margin < next) next = rowTop - margin;
  else if (rowTop + rowHeight + margin > next + viewport)
    next = rowTop + rowHeight + margin - viewport;
  return Math.min(limit, Math.max(0, Math.round(next)));
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
