// Assembles the Fizz font faces from the glyph grids and writes them as OpenType (CFF) files.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { ACCENT_ROWS, CAP_HEIGHT, CELL_ROWS, DESCENDER_ROWS } from './fizz-glyphs';
import {
  SPACE_ADVANCE,
  blank,
  cutGlyph,
  masterGlyphs,
  monoCell,
  monoPlace,
  parse,
  type Cut,
  type Grid,
  type Placed,
} from './derive';
import { puaGlyphs } from './keycaps';
import { traceOutline } from './outline';
import { BUTTON_CODES, FIXED_KEYS, FIXED_KEY_BASE } from './tokens';
import * as ot from 'opentype.js';
import type { Pt } from './outline';

/** Font units in one glyph pixel. */
export const PIXEL = 100;
/** Units per em: eleven pixel rows. */
export const UNITS_PER_EM = CELL_ROWS * PIXEL;
/** Height of the ascender: the accent and cap rows. */
export const ASCENDER = (ACCENT_ROWS + CAP_HEIGHT) * PIXEL;
/** Depth of the descender: the descender rows, as a negative number. */
export const DESCENDER = -DESCENDER_ROWS * PIXEL;
/** Extra space between lines: two pixel rows, so a line is thirteen rows tall. */
export const LINE_GAP = 2 * PIXEL;

/** One font file to build. */
export interface FaceSpec {
  /** File name without extension. */
  file: string;
  family: string;
  /** Style name, such as `Bold Oblique`. */
  style: string;
  cut: Cut;
  mono: boolean;
  /** Condensed faces form their own family and use width class 3. */
  condensed: boolean;
}

/** Every face in the family, in the order they are built. */
/** Every face in the family, in the order they are built. */
export const FACES: FaceSpec[] = [
  {
    file: 'fizz-regular',
    family: 'Fizz',
    style: 'Regular',
    cut: 'regular',
    mono: false,
    condensed: false,
  },
  { file: 'fizz-bold', family: 'Fizz', style: 'Bold', cut: 'bold', mono: false, condensed: false },
  {
    file: 'fizz-oblique',
    family: 'Fizz',
    style: 'Oblique',
    cut: 'oblique',
    mono: false,
    condensed: false,
  },
  {
    file: 'fizz-bold-oblique',
    family: 'Fizz',
    style: 'Bold Oblique',
    cut: 'boldOblique',
    mono: false,
    condensed: false,
  },
  {
    file: 'fizz-condensed',
    family: 'Fizz Condensed',
    style: 'Regular',
    cut: 'condensed',
    mono: false,
    condensed: true,
  },
  {
    file: 'fizz-mono-regular',
    family: 'Fizz Mono',
    style: 'Regular',
    cut: 'regular',
    mono: true,
    condensed: false,
  },
  {
    file: 'fizz-mono-bold',
    family: 'Fizz Mono',
    style: 'Bold',
    cut: 'bold',
    mono: true,
    condensed: false,
  },
];

const VERSION = '1.000';
/** 2026-01-01T00:00:00Z in Unix seconds, written to the font so builds are reproducible. */
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000;
/** Seconds between 1904-01-01, where font dates start, and the Unix epoch. */
const FONT_EPOCH = 2082844800;

/** A glyph at a code point, before it becomes an outline. */
export interface Entry {
  cp: number;
  name: string;
  placed: Placed;
}

const isBold = (s: FaceSpec): boolean => s.style.startsWith('Bold');
const isOblique = (s: FaceSpec): boolean => s.style.endsWith('Oblique');

/** Every glyph of a face, sorted by code point. */
export function faceEntries(spec: FaceSpec): Entry[] {
  const master = masterGlyphs();
  const cell = spec.mono ? monoCell(master, spec.cut) : 0;
  const place = (ch: string, rows: Grid, cut: Cut): Placed => {
    const p = cutGlyph(ch, rows, cut);
    return spec.mono ? monoPlace(ch, p, cell) : p;
  };
  const space: Placed = {
    rows: blank(0, CELL_ROWS),
    ox: 0,
    adv: spec.mono ? cell + 1 : SPACE_ADVANCE,
  };
  const entries: Entry[] = [];
  for (const [ch, rows] of Object.entries(master)) {
    const cp = ch.codePointAt(0) as number;
    entries.push({
      cp,
      name: `u${cp.toString(16).toUpperCase().padStart(4, '0')}`,
      placed: place(ch, rows, spec.cut),
    });
  }
  entries.push({ cp: 0x20, name: 'space', placed: space });
  entries.push({ cp: 0xa0, name: 'nbspace', placed: space });
  // Keycap labels follow the face's own cut when it is mono, and the regular cut otherwise.
  const letter = (ch: string): Placed => {
    if (ch === ' ') return space;
    const rows = master[ch] as Grid;
    return spec.mono ? place(ch, rows, spec.cut) : cutGlyph(ch, rows, 'regular');
  };
  for (const g of puaGlyphs(master, letter)) {
    const ch = String.fromCodePoint(g.cp);
    const placed: Placed = g.joiner
      ? { rows: g.rows, ox: 0, adv: g.rows[0]?.length ?? 0 }
      : place(ch, g.rows, 'regular');
    entries.push({ cp: g.cp, name: g.name, placed });
  }
  entries.sort((a, b) => a.cp - b.cp);
  return entries;
}

/** The `.notdef` glyph: a hollow box. */
function notdef(): Placed {
  const rows = parse('####/#..#/#..#/#..#/#..#/#..#/####');
  const g = blank(4, CELL_ROWS);
  rows.forEach((r, y) => r.forEach((v, x) => ((g[y + ACCENT_ROWS] as number[])[x] = v)));
  return { rows: g, ox: 0, adv: 5 };
}

/** A glyph's contours in font units, wound counter-clockwise for CFF's outer-shape convention. */
function toPath(p: Placed): ot.Path {
  const top = ACCENT_ROWS + CAP_HEIGHT;
  const path = new ot.Path();
  for (const c of traceOutline(p.rows, top, p.ox)) {
    // traceOutline winds outer shapes clockwise (TrueType); CFF fills the opposite way round.
    const pts: Pt[] = c.map((pt) => ({ x: pt.x * PIXEL, y: pt.y * PIXEL })).reverse();
    pts.forEach((pt, i) => (i === 0 ? path.moveTo(pt.x, pt.y) : path.lineTo(pt.x, pt.y)));
    path.close();
  }
  return path;
}

const LICENCE =
  'This Font Software is licensed under the SIL Open Font License, Version 1.1. ' +
  'This license is available with a FAQ at: https://openfontlicense.org';

/** Builds one face as an OpenType (CFF) file. */
export function buildFace(spec: FaceSpec): Uint8Array {
  const entries = faceEntries(spec);
  const glyph = (name: string, cp: number | undefined, p: Placed): ot.Glyph =>
    new ot.Glyph({ name, unicode: cp, advanceWidth: p.adv * PIXEL, path: toPath(p) });
  const glyphs: ot.Glyph[] = [glyph('.notdef', undefined, notdef())];
  const cmap = new Map<number, number>();
  for (const e of entries) {
    cmap.set(e.cp, glyphs.length);
    glyphs.push(glyph(e.name, e.cp, e.placed));
  }
  const bold = isBold(spec);
  const oblique = isOblique(spec);
  const legacy = bold && oblique ? 'Bold Italic' : oblique ? 'Italic' : bold ? 'Bold' : 'Regular';
  const full = `${spec.family} ${spec.style}`;
  const font = new ot.Font({
    familyName: spec.family,
    styleName: legacy,
    fullName: full,
    postScriptName: `${spec.family.replace(/ /g, '')}-${spec.style.replace(/ /g, '')}`,
    version: `Version ${VERSION}`,
    copyright: 'Copyright (c) 2026 Liminal HQ, Scott Morris',
    designer: 'Scott Morris',
    manufacturer: 'Liminal HQ',
    manufacturerURL: 'https://github.com/liminal-hq/lieutenant-fizz',
    license: LICENCE,
    licenseURL: 'https://openfontlicense.org',
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    weightClass: bold ? 700 : 400,
    widthClass: spec.condensed ? 3 : 5,
    italic: oblique,
    bold,
    italicAngle: oblique ? -18.43 : 0,
    panose: [2, 0, 0, spec.mono ? 9 : 0, 0, 0, 0, 0, 0, 0],
    createdTimestamp: TIMESTAMP,
    glyphs,
  });
  // Oblique faces share the family "Fizz" and carry "Oblique" as their typographic subfamily.
  const names = font.names as unknown as { windows: Record<string, { en: string }> };
  names.windows['preferredFamily'] = { en: spec.family };
  names.windows['preferredSubfamily'] = { en: spec.style };
  names.windows['uniqueID'] = { en: `Liminal HQ: ${full}: ${VERSION}` };
  for (const l of ligaturesFor(cmap)) font.substitution.addLigature('liga', l);
  return finishFont(new Uint8Array(font.toArrayBuffer()), TIMESTAMP, LINE_GAP);
}

const sfntSum = (data: Uint8Array, from: number, length: number): number => {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    let word = 0;
    for (let k = 0; k < 4; k++)
      word = (word << 8) | (i + k < length ? (data[from + i + k] as number) : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
};

/**
 * Fixes up what opentype.js cannot express. It stamps the `head` modified date from the clock, which
 * would make every build differ, so both dates are pinned; and it has no line gap option, so the
 * 200-unit gap is written into `hhea` and `OS/2` (`sTypoLineGap`). The checksums covering each change
 * are recomputed.
 */
export function finishFont(file: Uint8Array, unixSeconds: number, lineGap: number): Uint8Array {
  const out = Uint8Array.from(file);
  const dv = new DataView(out.buffer);
  const count = dv.getUint16(4);
  const stamp = unixSeconds + FONT_EPOCH;
  let head = -1;
  for (let i = 0; i < count; i++) {
    const rec = 12 + 16 * i;
    const tag = String.fromCharCode(...out.subarray(rec, rec + 4));
    const at = dv.getUint32(rec + 8);
    if (tag === 'head') {
      head = at;
      dv.setUint32(at + 8, 0);
      for (const field of [20, 28]) {
        dv.setUint32(at + field, 0);
        dv.setUint32(at + field + 4, stamp);
      }
    } else if (tag === 'hhea') {
      dv.setInt16(at + 8, lineGap);
    } else if (tag === 'OS/2') {
      dv.setInt16(at + 72, lineGap);
    } else continue;
    dv.setUint32(rec + 4, sfntSum(out, at, dv.getUint32(rec + 12)));
  }
  if (head < 0) throw new Error('font has no head table');
  dv.setUint32(head + 8, (0xb1b0afba - sfntSum(out, 0, out.length)) >>> 0);
  return out;
}

/** The ligatures for `{A}`-style tokens: the characters of the token become one glyph. */
function ligaturesFor(cmap: Map<number, number>): { sub: number[]; by: number }[] {
  const out: { sub: number[]; by: number }[] = [];
  const add = (label: string, cp: number): void => {
    const sub = Array.from(`{${label}}`, (c) => cmap.get(c.codePointAt(0) as number));
    const by = cmap.get(cp);
    if (by === undefined || sub.some((c) => c === undefined)) return;
    out.push({ sub: sub as number[], by });
  };
  for (const [name, cp] of Object.entries(BUTTON_CODES)) add(name, cp);
  FIXED_KEYS.forEach((key, i) => add(key, FIXED_KEY_BASE + i));
  return out;
}
