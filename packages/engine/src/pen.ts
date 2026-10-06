// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Colour } from './palette';

/** A palette-indexed pixel grid; `null` is transparent. Row 0 is the top. */
export interface Grid {
  readonly w: number;
  readonly h: number;
  at(x: number, y: number): Colour | null;
}

export type CellFn = (x: number, y: number, c: Colour | null) => Colour | null | undefined;

/** The pixel DSL: a tiny chainable pen for authoring sprites as EGA-indexed grids. */
export class Pen implements Grid {
  readonly cells: (Colour | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array<Colour | null>(w * h).fill(null);
  }

  at(x: number, y: number): Colour | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.cells[y * this.w + x] ?? null;
  }

  px(x: number, y: number, c: Colour | null): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Colour | null): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
    return this;
  }

  /** Filled ellipse centred at (cx, cy); `cond` can clip it (e.g. top half only). */
  ell(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    c: Colour,
    cond?: (i: number, j: number) => boolean,
  ): this {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const dx = (i + 0.5 - cx) / rx;
        const dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!cond || cond(i, j))) this.px(i, j, c);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Colour): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let k = 0; k <= n; k++) {
      this.px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
    }
    return this;
  }

  /** Rewrites cells: return a colour (or null) to set, `undefined` to leave unchanged. */
  fn(f: CellFn): this {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = f(x, y, this.at(x, y));
        if (c !== undefined) this.cells[y * this.w + x] = c;
      }
    }
    return this;
  }

  /** Adds a 1px outline (default black) around opaque pixels. */
  outline(c: Colour = 'k'): this {
    const add: [number, number][] = [];
    const n = (i: number, j: number): boolean => {
      const v = this.at(i, j);
      return v !== null && v !== c;
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.at(x, y) && (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1))) {
          add.push([x, y]);
        }
      }
    }
    for (const [x, y] of add) this.px(x, y, c);
    return this;
  }
}

/** Deterministic xorshift generator used for sprite speckle (same output on every machine). */
export function spriteRng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
