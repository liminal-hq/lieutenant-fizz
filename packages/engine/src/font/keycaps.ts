// Glyph grids for controller buttons and keycaps, drawn from the master letters.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { CELL_ROWS } from './fizz-glyphs';
import { blank, trim, width, type Grid, type Placed } from './derive';
import {
  BUTTON_CODES,
  FIXED_KEYS,
  FIXED_KEY_BASE,
  KEYED_ARROWS,
  KEYED_ARROW_BASE,
  KEYED_BASE,
  KEY_CENTRE,
  KEY_LEFT,
  KEY_RIGHT,
} from './tokens';

/** A generated glyph at a private-use code point. */
export interface PuaGlyph {
  cp: number;
  name: string;
  rows: Grid;
  /** True for keycap parts, whose edges must meet, so they advance exactly their width. */
  joiner: boolean;
}

/** Button height in rows: one row of air above and below the capitals. */
const BUTTON_ROWS = 9;
/** Row of the cell where a button starts. */
const BUTTON_TOP = 1;
/** Blank columns between a pill's end and its label. */
const PILL_MARGIN = 3;

/** A stadium (pill) shape `w` wide and nine rows tall, placed in the full cell. */
function stadium(w: number): Grid {
  const g = blank(w, CELL_ROWS);
  const r = BUTTON_ROWS / 2;
  for (let j = 0; j < BUTTON_ROWS; j++) {
    for (let i = 0; i < w; i++) {
      const cx = Math.min(Math.max(i + 0.5, r), w - r);
      const dx = i + 0.5 - cx;
      const dy = j + 0.5 - r;
      if (dx * dx + dy * dy <= r * r - 0.3) (g[j + BUTTON_TOP] as number[])[i] = 1;
    }
  }
  return g;
}

/** Lays the master letters of `label` side by side with a one-pixel gap, as one trimmed grid. */
function label(master: Record<string, Grid>, text: string): Grid {
  const parts = Array.from(text, (c) => trim(master[c] as Grid));
  const w = parts.reduce((s, p) => s + width(p) + 1, -1);
  const out = blank(w, CELL_ROWS);
  let x = 0;
  for (const p of parts) {
    p.forEach((row, y) =>
      row.forEach((v, i) => {
        if (v) (out[y] as number[])[x + i] = 1;
      }),
    );
    x += width(p) + 1;
  }
  return out;
}

/** A button: the stadium with the label's pixels cut out of it, so it works in a single colour. */
function button(master: Record<string, Grid>, text: string): Grid {
  const lab = label(master, text);
  const lw = width(lab);
  // A one-letter button stays a circle; longer labels get a pill with a little more air.
  const margin = text.length === 1 ? 2 : PILL_MARGIN;
  const w = Math.max(BUTTON_ROWS, lw + margin * 2);
  const g = stadium(w);
  const off = Math.floor((w - lw) / 2);
  lab.forEach((row, y) =>
    row.forEach((v, i) => {
      if (v) (g[y] as number[])[off + i] = 0;
    }),
  );
  return g;
}

/** The two row indices that carry a keycap's top and bottom edges. */
const EDGE_TOP = 0;
const EDGE_BOTTOM = CELL_ROWS - 1;

/** A keycap label character: its shape inside top and bottom edges, over its full advance. */
function keyed(p: Placed): Grid {
  const g = blank(p.adv, CELL_ROWS);
  p.rows.forEach((row, y) => {
    // The second descender row would run into the bottom edge, so tails are cut to one row.
    if (y >= CELL_ROWS - 1) return;
    row.forEach((v, x) => {
      const col = x + p.ox;
      if (v && col >= 0 && col < p.adv) (g[y] as number[])[col] = 1;
    });
  });
  for (let x = 0; x < p.adv; x++) {
    (g[EDGE_TOP] as number[])[x] = 1;
    (g[EDGE_BOTTOM] as number[])[x] = 1;
  }
  return g;
}

function capLeft(): Grid {
  const g = blank(2, CELL_ROWS);
  for (let y = 1; y < CELL_ROWS - 1; y++) (g[y] as number[])[0] = 1;
  (g[EDGE_TOP] as number[])[1] = 1;
  (g[EDGE_BOTTOM] as number[])[1] = 1;
  return g;
}

function capRight(): Grid {
  const g = blank(1, CELL_ROWS);
  for (let y = 1; y < CELL_ROWS - 1; y++) (g[y] as number[])[0] = 1;
  return g;
}

/** Joins grids left to right. */
function concat(parts: Grid[]): Grid {
  const out = parts[0]?.map(() => [] as number[]) ?? [];
  for (const p of parts) p.forEach((row, y) => (out[y] as number[]).push(...row));
  return out;
}

/**
 * Builds every private-use glyph for one face.
 *
 * `master` holds the full-height letters; `letter` returns how a character is placed in this face
 * (its cut, and the mono cell where there is one), which sets the width of keycap labels.
 */
export function puaGlyphs(
  master: Record<string, Grid>,
  letter: (ch: string) => Placed,
): PuaGlyph[] {
  const out: PuaGlyph[] = [];
  for (const [name, cp] of Object.entries(BUTTON_CODES)) {
    const text = name.length === 1 || name.length === 2 ? name : name.toUpperCase();
    out.push({ cp, name: `button.${name}`, rows: button(master, text), joiner: false });
  }
  out.push({ cp: KEY_LEFT, name: 'key.left', rows: capLeft(), joiner: true });
  out.push({ cp: KEY_RIGHT, name: 'key.right', rows: capRight(), joiner: true });
  const keyedFor = (ch: string): Grid => keyed(letter(ch));
  for (let cp = 0x20; cp <= 0x7e; cp++) {
    const rows = keyedFor(String.fromCharCode(cp));
    out.push({ cp: KEYED_BASE + cp - 0x20, name: `keyed.${cp.toString(16)}`, rows, joiner: true });
    if (cp === 0x20) out.push({ cp: KEY_CENTRE, name: 'key.centre', rows, joiner: true });
  }
  KEYED_ARROWS.forEach((arrow, i) => {
    const rows = keyedFor(arrow);
    out.push({ cp: KEYED_ARROW_BASE + i, name: `keyed.arrow${i}`, rows, joiner: true });
  });
  FIXED_KEYS.forEach((key, i) => {
    const rows = concat([capLeft(), ...Array.from(key, keyedFor), capRight()]);
    out.push({ cp: FIXED_KEY_BASE + i, name: `key.${key}`, rows, joiner: true });
  });
  return out;
}
