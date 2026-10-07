// Pure glyph derivations: accents, box drawing, bold, oblique, condensed and mono cells.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  ACCENT_ROWS,
  CAP_HEIGHT,
  CELL_ROWS,
  EMOJI,
  EXTRA,
  RAW,
  WIDE,
  X_HEIGHT,
} from './fizz-glyphs';
import type { Grid } from './outline';

export type { Grid };

/** Pixels between words: the width of a space, with no extra gap after it. */
export const SPACE_ADVANCE = Math.max(3, Math.round(CAP_HEIGHT * 0.45));

/** Parses a `/`-separated row string into a grid of 0 and 1. */
export const parse = (s: string): Grid =>
  s.split('/').map((r) => Array.from(r, (c) => (c === '#' ? 1 : 0)));

/** A grid of zeros. */
export const blank = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => new Array<number>(w).fill(0));

/** The width of the widest row. */
export const width = (rows: Grid): number => rows.reduce((m, r) => Math.max(m, r.length), 0);

/** Places `rows` into a taller blank grid, `top` rows down. */
export function pad(rows: Grid, height: number, top: number): Grid {
  const out = blank(width(rows), height);
  rows.forEach((r, y) =>
    r.forEach((v, x) => {
      const row = out[y + top];
      if (row) row[x] = v;
    }),
  );
  return out;
}

/** Drops blank columns from both sides. A blank grid becomes one blank column. */
export function trim(rows: Grid): Grid {
  const w = width(rows);
  const empty = (x: number): boolean => rows.every((row) => !row[x]);
  let l = 0;
  let r = w - 1;
  while (l < w && empty(l)) l++;
  while (r > l && empty(r)) r--;
  return rows.map((row) => row.slice(l, r + 1));
}

/**
 * Gap-preserving bold: each ink pixel also fills the pixel to its right, unless that would close a
 * one-pixel gap between two strokes.
 */
export function bold(rows: Grid): Grid {
  return rows.map((r) => {
    const o = new Array<number>(r.length + 1).fill(0);
    r.forEach((v, x) => {
      if (!v) return;
      o[x] = 1;
      if (!r[x + 2] || r[x + 1]) o[x + 1] = 1;
    });
    return o;
  });
}

/**
 * Merge-based condensed cut: five-wide glyphs lose a column by merging the middle three. Wide glyphs
 * and anything that is not five wide are returned unchanged.
 */
export function condense(rows: Grid, ch: string): Grid {
  if (width(rows) !== 5 || WIDE.has(ch)) return rows.map((r) => r.slice());
  return rows.map((r) => [
    r[0] ?? 0,
    (r[1] ?? 0) | (r[2] ?? 0),
    (r[2] ?? 0) | (r[3] ?? 0),
    r[4] ?? 0,
  ]);
}

/** An oblique glyph: the sheared pixels, where column 0 sits, and the unslanted width. */
export interface Sheared {
  rows: Grid;
  /** Pixel offset of column 0 from the pen position; zero or negative. */
  ox: number;
  /** The width of the glyph before shearing: the advance stays this wide. */
  adv: number;
}

/** Shear: one pixel to the right for every three rows above `base`. */
export function oblique(rows: Grid, base: number): Sheared {
  const shift = rows.map((_, y) => Math.floor((base - y) / 3));
  const min = Math.min(...shift);
  const max = Math.max(...shift);
  const w = width(rows) + (max - min);
  const out = rows.map((r, y) => {
    const o = new Array<number>(w).fill(0);
    r.forEach((v, x) => {
      if (v) o[x + (shift[y] as number) - min] = 1;
    });
    return o;
  });
  return { rows: out, ox: min, adv: width(rows) };
}

const MARKS: Record<string, Grid> = {
  acute: parse('.#/#.'),
  grave: parse('#./.#'),
  circ: parse('.#./#.#'),
  diaer: parse('#.#'),
  ced: parse('.#/##'),
};

/** Accented letters: result character, base character and the mark that sits on it. */
const ACCENTS: [string, string, string][] = [
  ['é', 'e', 'acute'],
  ['è', 'e', 'grave'],
  ['ê', 'e', 'circ'],
  ['ë', 'e', 'diaer'],
  ['à', 'a', 'grave'],
  ['â', 'a', 'circ'],
  ['ç', 'c', 'ced'],
  ['ô', 'o', 'circ'],
  ['û', 'u', 'circ'],
  ['ù', 'u', 'grave'],
  ['î', 'ı', 'circ'],
  ['ï', 'ı', 'diaer'],
  ['É', 'E', 'acute'],
  ['È', 'E', 'grave'],
  ['Ê', 'E', 'circ'],
  ['À', 'A', 'grave'],
  ['Ç', 'C', 'ced'],
  ['Ô', 'O', 'circ'],
];

/**
 * Adds the dotless ı and the Canadian French accented letters to a set of full-height glyphs.
 * Marks sit in the two accent rows above capitals, three rows above the x-height for lowercase, and
 * the cedilla hangs in the descender rows.
 */
export function composeAccents(glyphs: Record<string, Grid>): Record<string, Grid> {
  const out: Record<string, Grid> = { ...glyphs };
  const xTop = ACCENT_ROWS + CAP_HEIGHT - X_HEIGHT;
  const dotless = (glyphs['i'] as Grid).map((r, y) => (y < xTop ? r.map(() => 0) : r.slice()));
  out['ı'] = dotless;
  for (const [ch, base, mark] of ACCENTS) {
    const src = out[base];
    if (!src) continue;
    const m = MARKS[mark] as Grid;
    const rows = src.map((r) => r.slice());
    const off = Math.floor((width(rows) - width(m)) / 2);
    const upper = base === base.toUpperCase() && base !== 'ı';
    const r0 = mark === 'ced' ? ACCENT_ROWS + CAP_HEIGHT : upper ? 0 : Math.max(0, xTop - 3);
    m.forEach((mr, y) =>
      mr.forEach((v, x) => {
        const row = rows[r0 + y];
        if (v && row) row[x + off] = 1;
      }),
    );
    out[ch] = rows;
  }
  return out;
}

/** Characters generated to fill the whole cell so that lines join between neighbours. */
export const JOINERS = new Set(Array.from('─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬'));

/** Single and double box drawing, six pixels wide and the full cell high. */
export function boxDrawing(): Record<string, Grid> {
  const W = 6;
  const H = CELL_ROWS;
  const mid = ACCENT_ROWS + Math.floor(CAP_HEIGHT / 2);
  const c = 2;
  const box = (fn: (x: number, y: number) => boolean): Grid => {
    const r = blank(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) (r[y] as number[])[x] = 1;
    return r;
  };
  return {
    '─': box((x, y) => y === mid),
    '│': box((x) => x === c),
    '┌': box((x, y) => (y === mid && x >= c) || (x === c && y >= mid)),
    '┐': box((x, y) => (y === mid && x <= c) || (x === c && y >= mid)),
    '└': box((x, y) => (y === mid && x >= c) || (x === c && y <= mid)),
    '┘': box((x, y) => (y === mid && x <= c) || (x === c && y <= mid)),
    '═': box((x, y) => y === mid - 1 || y === mid + 1),
    '║': box((x) => x === 1 || x === 3),
    '╔': box(
      (x, y) =>
        (y === mid - 1 && x >= 1) ||
        (x === 1 && y >= mid - 1) ||
        (y === mid + 1 && x >= 3) ||
        (x === 3 && y >= mid + 1),
    ),
    '╗': box(
      (x, y) =>
        (y === mid - 1 && x <= 3) ||
        (x === 3 && y >= mid - 1) ||
        (y === mid + 1 && x <= 1) ||
        (x === 1 && y >= mid + 1),
    ),
    '╚': box(
      (x, y) =>
        (y === mid + 1 && x >= 1) ||
        (x === 1 && y <= mid + 1) ||
        (y === mid - 1 && x >= 3) ||
        (x === 3 && y <= mid - 1),
    ),
    '╝': box(
      (x, y) =>
        (y === mid + 1 && x <= 3) ||
        (x === 3 && y <= mid + 1) ||
        (y === mid - 1 && x <= 1) ||
        (x === 1 && y <= mid - 1),
    ),
    '├': box((x, y) => x === c || (y === mid && x >= c)),
    '┤': box((x, y) => x === c || (y === mid && x <= c)),
    '┬': box((x, y) => y === mid || (x === c && y >= mid)),
    '┴': box((x, y) => y === mid || (x === c && y <= mid)),
    '┼': box((x, y) => x === c || y === mid),
    '╠': box(
      (x, y) =>
        x === 1 ||
        (x === 3 && (y <= mid - 1 || y >= mid + 1)) ||
        ((y === mid - 1 || y === mid + 1) && x >= 3),
    ),
    '╣': box(
      (x, y) =>
        x === 3 ||
        (x === 1 && (y <= mid - 1 || y >= mid + 1)) ||
        ((y === mid - 1 || y === mid + 1) && x <= 1),
    ),
    '╦': box(
      (x, y) =>
        y === mid - 1 ||
        (y === mid + 1 && (x <= 1 || x >= 3)) ||
        ((x === 1 || x === 3) && y >= mid + 1),
    ),
    '╩': box(
      (x, y) =>
        y === mid + 1 ||
        (y === mid - 1 && (x <= 1 || x >= 3)) ||
        ((x === 1 || x === 3) && y <= mid - 1),
    ),
    '╬': box(
      (x, y) =>
        ((x === 1 || x === 3) && (y <= mid - 1 || y >= mid + 1)) ||
        ((y === mid - 1 || y === mid + 1) && (x <= 1 || x >= 3)),
    ),
  };
}

/** Every drawn glyph padded to the full cell, with accents and box drawing added. */
export function masterGlyphs(): Record<string, Grid> {
  const base: Record<string, Grid> = {};
  for (const [ch, s] of Object.entries({ ...RAW, ...EXTRA })) {
    base[ch] = pad(parse(s), CELL_ROWS, ACCENT_ROWS);
  }
  return { ...composeAccents(base), ...boxDrawing() };
}

/** The styles a face can be cut in. */
export type Cut = 'regular' | 'bold' | 'condensed' | 'oblique' | 'boldOblique';

/** A glyph ready to become an outline. */
export interface Placed {
  rows: Grid;
  /** Pixel offset of column 0 from the pen position. */
  ox: number;
  /** Advance in pixels, including the one-pixel gap after the glyph. */
  adv: number;
}

const EMOJI_SET = new Set(EMOJI);

/** Glyphs that keep their shape in every cut: pictures and joiners (the caller adds PUA glyphs). */
export const isFixedShape = (ch: string): boolean => JOINERS.has(ch) || EMOJI_SET.has(ch);

/** Applies a cut to one master glyph. Joiners advance their exact width, everything else adds a gap. */
export function cutGlyph(ch: string, rows: Grid, cut: Cut, fixed = isFixedShape(ch)): Placed {
  if (JOINERS.has(ch)) return { rows, ox: 0, adv: width(rows) };
  if (fixed) return { rows, ox: 0, adv: width(rows) + 1 };
  let g = rows;
  if (cut === 'bold' || cut === 'boldOblique') g = bold(g);
  else if (cut === 'condensed') g = condense(g, ch);
  if (cut === 'oblique' || cut === 'boldOblique') {
    const s = oblique(g, 1 + CAP_HEIGHT);
    return { rows: s.rows, ox: s.ox, adv: s.adv + 1 };
  }
  return { rows: g, ox: 0, adv: width(g) + 1 };
}

const CELL_PROBE = Array.from('ABCDEFGHIJKLNOPQRSTUVXYZabcdefghijklnopqrstuvxyz0123456789');

/** The mono cell: the widest trimmed letter or digit (not M, W, m or w) in the given cut. */
export function monoCell(master: Record<string, Grid>, cut: Cut): number {
  let m = 0;
  for (const ch of CELL_PROBE) {
    const g = master[ch];
    if (g) m = Math.max(m, width(trim(cutGlyph(ch, g, cut).rows)));
  }
  return m;
}

/** Centres a glyph in a fixed cell. Joiners are left alone so lines still meet. */
export function monoPlace(ch: string, p: Placed, cell: number): Placed {
  if (JOINERS.has(ch)) {
    // Widen a joiner to the mono advance by repeating its last column, so its lines still reach the
    // next cell and every glyph keeps the same advance.
    const want = cell + 1;
    if (p.adv >= want) return p;
    const rows = p.rows.map((r) => {
      const out = r.slice();
      while (out.length < want) out.push(r[r.length - 1] ?? 0);
      return out;
    });
    return { rows, ox: p.ox, adv: want };
  }
  const t = trim(p.rows);
  const tw = width(t);
  // A glyph wider than one cell takes a whole number of cells, like a full-width character in a
  // terminal, so columns after it still line up. It is centred in the cells it takes.
  const unit = cell + 1;
  const adv = Math.max(1, Math.ceil((tw + 1) / unit)) * unit;
  return { rows: t, ox: Math.max(0, Math.floor((adv - 1 - tw) / 2)), adv };
}
