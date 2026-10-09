// Where the map's level panel docks on a phone: the side away from Ben, and the free rectangle it fits in.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure geometry in CSS pixels, with no DOM. The panel is the card the map shows at a level, a sign or a
// teleporter. On a phone it sits against the edge of the screen opposite Ben, so he and the path beside
// him stay in view, and it is fitted into whatever the controls, the HUD pills and the safe area leave.

import type { Shape } from '@lieutenant-fizz/engine/touch';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'left' | 'right';

/** The room the panel keeps from the safe-area edge and from anything it is docked beside, in CSS pixels. */
export const EDGE = 8;
/** The room the panel keeps from Ben's sprite, in CSS pixels. */
export const BEN_GAP = 16;
/** How far past the middle of the screen (as a fraction of its width) Ben goes before the panel changes side. */
export const FLIP_FRACTION = 0.1;
/** Ben's drawn box on the map is this many world units across, a little more than his 16 px sprite. */
export const BEN_UNITS = 1.3;
/** The widest the panel is, as a fraction of the screen width and in CSS pixels. */
export const MAX_WIDTH_FRACTION = 0.4;
export const MAX_WIDTH = 360;
/** The narrowest column worth docking the panel in. */
export const MIN_WIDTH = 120;

/** The bounding box of a control's hit area or face. */
export function shapeBox(s: Shape): Box {
  if ('r' in s) return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

/**
 * Which side the panel docks on. Ben left of the middle puts it on the right and the other way round; inside
 * a dead band either side of the middle the panel stays where it was (`prev`), so Ben standing near the
 * middle never makes it flap. With no previous side, the middle itself goes to the right.
 */
export function pickSide(benX: number, viewW: number, prev: Side | null): Side {
  const mid = viewW / 2;
  const band = viewW * FLIP_FRACTION;
  if (benX < mid - band) return 'right';
  if (benX > mid + band) return 'left';
  return prev ?? (benX > mid ? 'left' : 'right');
}

/** Ben's box on screen, from the centre of his body and the pixels per world unit. */
export function benBox(cx: number, cy: number, ppu: number): Box {
  const s = BEN_UNITS * ppu;
  return { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
}

/**
 * Where a world point lands on screen, in CSS pixels from the top left of the page. The camera looks at the
 * middle of the canvas, so `canvasW` and `canvasH` are the canvas's CSS size, not the host's: under Fast the
 * canvas overhangs the host's right and bottom edges, and its middle (and so Ben) sits that much further
 * right and down. `ppu` is CSS pixels per world unit, taken from the same canvas height.
 */
export function viewPoint(
  wx: number,
  wy: number,
  camX: number,
  camY: number,
  ppu: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return { x: (wx - camX) * ppu + canvasW / 2, y: canvasH / 2 - (wy - camY) * ppu };
}

/** The widest the panel gets on a screen this wide. */
export function maxPanelWidth(viewW: number): number {
  return Math.min(MAX_WIDTH, Math.round(viewW * MAX_WIDTH_FRACTION));
}

/** Something the panel keeps clear of: the area that takes a touch and the part that is drawn. */
export interface Obstacle {
  hit: Box;
  face: Box;
}

export interface DockInput {
  side: Side;
  /** The window minus the system's insets. */
  safe: Box;
  ben: Box;
  obstacles: readonly Obstacle[];
  /** The widest the panel gets (see {@link maxPanelWidth}). */
  maxWidth: number;
  /** The height of the panel when it is `w` px wide (it wraps to more lines when narrower). */
  measure: (w: number) => number;
}

/**
 * How the panel was placed: 1 fits clear of every hit area, 2 fits clear of every drawn face (it passes over
 * the margin around a control that takes touches), 3 does not fit anywhere and is the least bad, shifted up
 * to stay on screen so it overlaps the top of the control below it.
 */
export type Tier = 1 | 2 | 3;

export interface Dock {
  side: Side;
  box: Box;
  tier: Tier;
  /** How far the panel runs past the free gap it was put in, in CSS pixels (0 unless tier 3). */
  overflow: number;
}

const inflate = (b: Box, by: number): Box => ({
  x: b.x - by,
  y: b.y - by,
  w: b.w + by * 2,
  h: b.h + by * 2,
});

interface Candidate {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The free height of the gap the panel starts at the top of. */
  room: number;
}

/** Every rectangle worth trying: each pair of vertical edges, then each gap between the blocks in that column. */
function candidates(i: DockInput, blocks: readonly Box[]): Candidate[] {
  const top = i.safe.y + EDGE;
  const bottom = i.safe.y + i.safe.h - EDGE;
  const lo = i.side === 'right' ? i.ben.x + i.ben.w + BEN_GAP : i.safe.x + EDGE;
  const hi = i.side === 'right' ? i.safe.x + i.safe.w - EDGE : i.ben.x - BEN_GAP;
  const out: Candidate[] = [];
  if (hi - lo <= 0) return out;
  const starts = new Set<number>([lo]);
  const ends = new Set<number>([hi]);
  for (const b of blocks) {
    if (b.x + b.w > lo && b.x + b.w < hi) starts.add(b.x + b.w);
    if (b.x > lo && b.x < hi) ends.add(b.x);
  }
  const seen = new Set<string>();
  for (const a of starts) {
    for (const b of ends) {
      if (b - a < MIN_WIDTH) continue;
      const w = Math.min(b - a, i.maxWidth);
      const x = i.side === 'right' ? b - w : a;
      // The blocks in the panel's own column, then the free stretches between them.
      const col = blocks
        .filter((k) => k.x < x + w && k.x + k.w > x && k.y < bottom && k.y + k.h > top)
        .sort((p, q) => p.y - q.y);
      let y = top;
      const stretches: [number, number][] = [];
      for (const k of col) {
        if (k.y > y) stretches.push([y, k.y]);
        y = Math.max(y, k.y + k.h);
      }
      if (bottom > y) stretches.push([y, bottom]);
      for (const [s, e] of stretches) {
        const key = `${x}|${w}|${s}|${e}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x, y: s, w, h: 0, room: e - s });
      }
    }
  }
  return out;
}

/** The best candidate that fits: the widest (fewest lines), then the one furthest out, then the highest. */
function bestFit(i: DockInput, list: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  const outer = (c: Candidate): number => (i.side === 'right' ? c.x + c.w : -c.x);
  for (const c of list) {
    const h = i.measure(c.w);
    if (h > c.room) continue;
    const cand = { ...c, h };
    if (
      !best ||
      cand.w > best.w ||
      (cand.w === best.w && outer(cand) > outer(best)) ||
      (cand.w === best.w && outer(cand) === outer(best) && cand.y < best.y)
    )
      best = cand;
  }
  return best;
}

/**
 * Places the panel on `side`: against the screen edge away from Ben, in the largest free rectangle (the widest
 * panel that fits the height of its gap), clear of Ben and the safe area. It first keeps clear of every hit
 * area with a margin; failing that it keeps clear of the drawn faces only; failing that it takes the
 * rectangle that overflows least and shifts it up to stay on screen (tier 3).
 */
export function dockPanel(i: DockInput): Dock {
  const hits = i.obstacles.map((o) => inflate(o.hit, EDGE));
  const faces = i.obstacles.map((o) => o.face);
  const strict = candidates(i, hits);
  const first = bestFit(i, strict);
  if (first)
    return {
      side: i.side,
      box: { x: first.x, y: first.y, w: first.w, h: first.h },
      tier: 1,
      overflow: 0,
    };
  const loose = candidates(i, faces);
  const second = bestFit(i, loose);
  if (second)
    return {
      side: i.side,
      box: { x: second.x, y: second.y, w: second.w, h: second.h },
      tier: 2,
      overflow: 0,
    };
  // Nothing fits: take the rectangle that overflows least (the widest on a tie), and keep it on screen.
  let pick: Candidate | null = null;
  let over = Infinity;
  for (const c of [...loose, ...strict]) {
    const h = i.measure(c.w);
    // A panel taller than the screen would be cut off, which is worse than overlapping a control.
    const o = h - c.room + (h > i.safe.h - EDGE * 2 ? 1000 : 0);
    if (o < over || (o === over && pick && c.w > pick.w)) {
      over = o;
      pick = { ...c, h };
    }
  }
  const bottom = i.safe.y + i.safe.h - EDGE;
  if (!pick) {
    // No column at all (Ben fills the side): the safe area's far edge, as wide as is left.
    const w = Math.max(MIN_WIDTH, Math.min(i.maxWidth, i.safe.w - EDGE * 2));
    const h = i.measure(w);
    const x = i.side === 'right' ? i.safe.x + i.safe.w - EDGE - w : i.safe.x + EDGE;
    return {
      side: i.side,
      box: { x, y: i.safe.y + EDGE, w, h },
      tier: 3,
      overflow: h,
    };
  }
  const y = Math.max(i.safe.y + EDGE, Math.min(pick.y, bottom - pick.h));
  return { side: i.side, box: { x: pick.x, y, w: pick.w, h: pick.h }, tier: 3, overflow: over };
}

/** Whether two boxes share any area (touching edges do not count). */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Docks the panel on the side {@link pickSide} gives. When Ben is in the dead band around the middle, so
 * either side is fair, and the panel does not fit clear of the controls there, the other side is used if it
 * does better. Outside the band the side is Ben's alone, so it never changes for the sake of a fit.
 */
export function dockBest(
  i: Omit<DockInput, 'side'>,
  benX: number,
  viewW: number,
  prev: Side | null,
): Dock {
  const side = pickSide(benX, viewW, prev);
  const first = dockPanel({ ...i, side });
  if (first.tier === 1 || Math.abs(benX - viewW / 2) > viewW * FLIP_FRACTION) return first;
  const other = dockPanel({ ...i, side: side === 'left' ? 'right' : 'left' });
  const better =
    other.tier < first.tier ||
    (other.tier === 3 && first.tier === 3 && other.overflow < first.overflow);
  return better ? other : first;
}
