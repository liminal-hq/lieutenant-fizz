// Turns a grid of pixels into clean glyph contours: one polygon per connected shape, no overlaps.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A point in pixel or font units, with `y` up. */
export interface Pt {
  x: number;
  y: number;
}

/** Rows of 0 (blank) and 1 (ink). */
export type Grid = number[][];

type Dir = 0 | 1 | 2 | 3;
/** East, south, west, north: clockwise, so `(d + 1) % 4` is a right turn. */
const DX = [1, 0, -1, 0] as const;
const DY = [0, -1, 0, 1] as const;

const at = (g: Grid, x: number, y: number): boolean => (g[y]?.[x] ?? 0) === 1;

/**
 * Traces the outline of the ink in `grid`.
 *
 * Points are in pixel units with `x` to the right and `y` up, where the top edge of row `r` sits at
 * `top - r`. Edges are directed with the ink on their right, so outer contours run clockwise and
 * holes counter-clockwise, which is what TrueType's non-zero fill expects. Where two pixels touch
 * only at a corner they become separate contours. Collinear points are dropped.
 */
export function traceOutline(grid: Grid, top: number, left = 0): Pt[][] {
  // Directed edges keyed by their start vertex.
  const out = new Map<string, Dir[]>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const add = (x: number, y: number, d: Dir): void => {
    const k = key(x, y);
    const list = out.get(k);
    if (list) list.push(d);
    else out.set(k, [d]);
  };
  const height = grid.length;
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!at(grid, c, r)) continue;
      const x0 = left + c;
      const x1 = x0 + 1;
      const yt = top - r;
      const yb = yt - 1;
      if (!at(grid, c, r - 1)) add(x0, yt, 0);
      if (!at(grid, c + 1, r)) add(x1, yt, 1);
      if (!at(grid, c, r + 1)) add(x1, yb, 2);
      if (!at(grid, c - 1, r)) add(x0, yb, 3);
    }
  }
  const contours: Pt[][] = [];
  const starts = [...out.keys()].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number) as [number, number];
    const [bx, by] = b.split(',').map(Number) as [number, number];
    return by - ay || ax - bx;
  });
  for (const s of starts) {
    for (;;) {
      const list = out.get(s);
      if (!list || list.length === 0) break;
      const [sx, sy] = s.split(',').map(Number) as [number, number];
      const pts: Pt[] = [];
      let x = sx;
      let y = sy;
      let d = list[0] as Dir;
      list.splice(0, 1);
      for (;;) {
        pts.push({ x, y });
        x += DX[d];
        y += DY[d];
        if (x === sx && y === sy) break;
        const next = out.get(key(x, y)) as Dir[];
        // Prefer a right turn, then straight on, then left: this keeps corner-touching pixels apart.
        let pick = -1;
        for (const turn of [1, 0, 3]) {
          const want = ((d + turn) % 4) as Dir;
          pick = next.indexOf(want);
          if (pick >= 0) break;
        }
        d = next[pick] as Dir;
        next.splice(pick, 1);
      }
      contours.push(simplify(pts));
    }
  }
  return contours;
}

/** Removes points that sit on a straight run between their neighbours. */
function simplify(pts: Pt[]): Pt[] {
  const n = pts.length;
  const keep: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n] as Pt;
    const b = pts[i] as Pt;
    const c = pts[(i + 1) % n] as Pt;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) keep.push(b);
  }
  return keep;
}

/** Twice the signed area of a contour; negative for clockwise (outer) contours with `y` up. */
export function signedArea(c: Pt[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i] as Pt;
    const q = c[(i + 1) % c.length] as Pt;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}
