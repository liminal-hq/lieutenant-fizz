// Tests that rebuild the Fizz font and check it stays stable and well-formed.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';
import { FACES, PIXEL, buildFace, faceEntries, type FaceSpec } from './build';
import { traceOutline, signedArea } from './outline';
import { FIXED_KEYS, FIXED_KEY_BASE, hintText, keycap } from './tokens';

const fontsDir = new URL('../../assets/fonts/', import.meta.url);

function parse(spec: FaceSpec): opentype.Font {
  const b = buildFace(spec);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

interface LigSub {
  coverage: { glyphs: number[] };
  ligatureSets: { ligGlyph: number; components: number[] }[][];
}

/** Applies the font's `liga` lookup by hand, reading the tables back through opentype.js. */
function ligate(font: opentype.Font, text: string): number[] {
  const sub = (font.tables['gsub'] as unknown as { lookups: { subtables: LigSub[] }[] }).lookups[0]
    ?.subtables[0] as LigSub;
  const ids = Array.from(text, (c) => font.charToGlyphIndex(c));
  const out: number[] = [];
  for (let i = 0; i < ids.length;) {
    const set = sub.ligatureSets[sub.coverage.glyphs.indexOf(ids[i] as number)];
    const hit = set?.find((l) => l.components.every((c, k) => ids[i + 1 + k] === c));
    if (hit) {
      out.push(hit.ligGlyph);
      i += 1 + hit.components.length;
    } else out.push(ids[i++] as number);
  }
  return out;
}

const face = (file: string): FaceSpec => FACES.find((f) => f.file === file) as FaceSpec;

describe('font metrics', () => {
  const regular = parse(face('fizz-regular'));

  it('uses 1100 units per em with a 900 ascender and -200 descender', () => {
    expect(regular.unitsPerEm).toBe(1100);
    expect(regular.ascender).toBe(900);
    expect(regular.descender).toBe(-200);
  });

  it('has the same glyph count in every face', () => {
    const counts = FACES.map((f) => parse(f).glyphs.length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(309);
  });

  it('advances ordinary glyphs by their width plus one pixel', () => {
    expect(regular.charToGlyph('A').advanceWidth).toBe(6 * PIXEL);
    expect(regular.charToGlyph('i').advanceWidth).toBe(4 * PIXEL);
    expect(regular.charToGlyph(' ').advanceWidth).toBe(3 * PIXEL);
  });

  it('advances bold one pixel wider and condensed one pixel narrower', () => {
    expect(parse(face('fizz-bold')).charToGlyph('A').advanceWidth).toBe(7 * PIXEL);
    expect(parse(face('fizz-condensed')).charToGlyph('A').advanceWidth).toBe(5 * PIXEL);
  });

  it('keeps the oblique advance at the unslanted width', () => {
    const o = parse(face('fizz-oblique'));
    expect(o.charToGlyph('A').advanceWidth).toBe(6 * PIXEL);
    // The descender of a p leans one pixel left of the pen, so the left bearing is negative.
    expect(o.charToGlyph('p').getBoundingBox().x1).toBe(-PIXEL);
  });

  it('gives every mono glyph the same advance', () => {
    const m = parse(face('fizz-mono-regular'));
    const widths = new Set(Array.from('AIiMW.,0123 abc').map((c) => m.charToGlyph(c).advanceWidth));
    expect([...widths]).toEqual([6 * PIXEL]);
    const mb = parse(face('fizz-mono-bold'));
    expect(mb.charToGlyph('i').advanceWidth).toBe(7 * PIXEL);
  });
});

describe('outlines', () => {
  it('traces every glyph to exactly its ink: no overlaps, outer clockwise, holes counter-clockwise', () => {
    for (const spec of FACES) {
      for (const e of faceEntries(spec)) {
        const ink = e.placed.rows.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
        const area = traceOutline(e.placed.rows, 9, e.placed.ox).reduce(
          (s, c) => s + signedArea(c),
          0,
        );
        expect(-area / 2 || 0, `${spec.file} ${e.name}`).toBe(ink);
      }
    }
  });

  it('draws a capital O as four corner-touching bars', () => {
    const o = parse(face('fizz-regular')).charToGlyph('O');
    // The ring's bars touch only at corners, so each bar is its own contour.
    const closes = o.path.commands.filter((c) => c.type === 'Z').length;
    expect(closes).toBe(4);
  });

  it('puts the capital A on the baseline and rises 700 units', () => {
    const box = parse(face('fizz-regular')).charToGlyph('A').getBoundingBox();
    expect(box.y1).toBe(0);
    expect(box.y2).toBe(700);
  });
});

describe('coverage', () => {
  const regular = parse(face('fizz-regular'));
  const has = (chars: string): string[] =>
    Array.from(chars).filter((c) => regular.charToGlyph(c).index === 0);

  it('covers letters, digits and basic punctuation', () => {
    expect(has('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toEqual([]);
    expect(has(`.,:;!?'"-()[]{}/\\&+=#%*<>@$^_|~\``)).toEqual([]);
  });

  it('covers the typographic extras, accents, arrows and box drawing', () => {
    expect(has('‽“”‘’—–·…«»×')).toEqual([]);
    expect(has('éèêëàâçôûùîïÉÈÊÀÇÔ')).toEqual([]);
    expect(has('→←↑↓↙►◄▸▼▲♪●○▌')).toEqual([]);
    expect(has('─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬')).toEqual([]);
  });

  it('includes U+25BC and U+25B2 in every face, 7 wide with an 800-unit advance', () => {
    for (const spec of FACES) {
      const font = parse(spec);
      for (const cp of [0x25bc, 0x25b2]) {
        const g = font.glyphs.get(font.charToGlyphIndex(String.fromCodePoint(cp)));
        expect(g.unicode, `${spec.file} U+${cp.toString(16)}`).toBe(cp);
        expect(g.advanceWidth, `${spec.file} U+${cp.toString(16)}`).toBeGreaterThan(0);
      }
    }
    const regular = parse(face('fizz-regular'));
    const down = regular.glyphs.get(regular.charToGlyphIndex('▼'));
    expect(down.advanceWidth).toBe(800);
    // Ink rests on the baseline (y 0) and stops four rows above it.
    expect(down.getBoundingBox()).toMatchObject({ x1: 0, x2: 700, y1: 0, y2: 400 });
  });

  it('covers the 24 pictures at their real code points', () => {
    expect(has('🙂😀😉😮😢😠😎❤⭐✓✗👍🍁👽🛸🥤☕💾🎮🔊🔇🔒⚡🏆')).toEqual([]);
  });

  it('has the button and keycap glyphs in the private use area', () => {
    expect(has('')).toEqual([]);
    expect(has('')).toEqual([]);
    expect(has(hintText('{[Page Up]}'))).toEqual([]);
    expect(has(hintText('{[↑↓]} {[←→]}'))).toEqual([]);
    expect(hintText('{[↑]}')).toBe(`\uE0F0\uE162\uE0F2`);
  });
});

describe('ligatures and hint text', () => {
  const regular = parse(face('fizz-regular'));

  it('replaces a button token with one glyph', () => {
    const glyphs = ligate(regular, '{A}');
    expect(glyphs).toEqual([regular.charToGlyphIndex('\uE000')]);
    expect(ligate(regular, '{Start}')).toEqual([regular.charToGlyphIndex('\uE014')]);
    expect(ligate(regular, 'Press {B}!')).toHaveLength(8);
  });

  it('replaces fixed key tokens with one whole keycap', () => {
    FIXED_KEYS.forEach((k, i) => {
      expect(ligate(regular, `{${k}}`), k).toEqual([
        regular.charToGlyphIndex(String.fromCodePoint(FIXED_KEY_BASE + i)),
      ]);
    });
  });

  it('leaves unknown tokens as plain text', () => {
    expect(ligate(regular, '{Nope}')).toHaveLength(6);
  });

  it('hintText maps tokens to the same glyphs the ligatures produce', () => {
    expect(hintText('{A}')).toBe('');
    expect(hintText('{Esc}')).toBe(String.fromCodePoint(FIXED_KEY_BASE));
    expect(hintText('Press {Start}')).toBe('Press ');
  });

  it('hintText wraps any other label in keycap ends', () => {
    expect(hintText('{[Z]}')).toBe(keycap('Z'));
    expect(hintText('{Page Up}')).toBe(keycap('Page Up'));
    expect(keycap('Z')).toHaveLength(3);
  });
});

describe('name table', () => {
  it('carries the family, copyright and licence', () => {
    const n = parse(face('fizz-bold-oblique')).names as unknown as {
      windows: Record<string, Record<string, string>>;
    };
    const w = n.windows;
    expect(w['fontFamily']?.['en']).toBe('Fizz');
    expect(w['fontSubfamily']?.['en']).toBe('Bold Italic');
    expect(w['preferredSubfamily']?.['en']).toBe('Bold Oblique');
    expect(w['copyright']?.['en']).toBe('Copyright (c) 2026 Liminal HQ, Scott Morris');
    expect(w['license']?.['en']).toContain('SIL Open Font License');
    expect(w['postScriptName']?.['en']).toBe('Fizz-BoldOblique');
  });

  it('makes Condensed and Mono their own families', () => {
    const fam = (f: string): string =>
      (parse(face(f)).names as unknown as { windows: Record<string, Record<string, string>> })
        .windows['fontFamily']?.['en'] ?? '';
    expect(fam('fizz-condensed')).toBe('Fizz Condensed');
    expect(fam('fizz-mono-bold')).toBe('Fizz Mono');
  });
});

describe('vertical metrics', () => {
  it('writes the 200-unit line gap to both hhea and OS/2 in every face', () => {
    for (const spec of FACES) {
      const font = parse(spec);
      const hhea = font.tables['hhea'] as { lineGap: number; ascender: number; descender: number };
      const os2 = font.tables['os2'] as {
        sTypoLineGap: number;
        sTypoAscender: number;
        sTypoDescender: number;
      };
      expect(hhea.lineGap, `${spec.file} hhea`).toBe(200);
      expect(os2.sTypoLineGap, `${spec.file} OS/2`).toBe(200);
      expect([hhea.ascender, hhea.descender]).toEqual([900, -200]);
      expect([os2.sTypoAscender, os2.sTypoDescender]).toEqual([900, -200]);
    }
  });
});

describe('reproducibility', () => {
  it('builds the same bytes every time', () => {
    const spec = face('fizz-bold-oblique');
    expect(Buffer.from(buildFace(spec)).equals(Buffer.from(buildFace(spec)))).toBe(true);
  });

  it('pins both head dates to 2026-01-01', () => {
    const head = parse(face('fizz-regular')).tables['head'] as {
      created: number;
      modified: number;
    };
    const expected = Date.UTC(2026, 0, 1) / 1000;
    expect(head.created).toBe(expected);
    expect(head.modified).toBe(expected);
  });
});

describe('committed font files', () => {
  it('match a fresh build byte for byte', () => {
    for (const spec of FACES) {
      const path = fileURLToPath(new URL(`${spec.file}.otf`, fontsDir));
      expect(existsSync(path), `${spec.file}.otf exists`).toBe(true);
      expect(Buffer.from(readFileSync(path)).equals(Buffer.from(buildFace(spec))), spec.file).toBe(
        true,
      );
      const woff2 = readFileSync(fileURLToPath(new URL(`${spec.file}.woff2`, fontsDir)));
      expect(woff2.subarray(0, 4).toString('latin1'), `${spec.file}.woff2`).toBe('wOF2');
    }
  });
});

describe('mono advances', () => {
  it('puts every glyph on a whole number of mono cells, so columns line up', () => {
    for (const file of ['fizz-mono-regular', 'fizz-mono-bold']) {
      const spec = face(file);
      const cell = parse(spec).charToGlyph('A').advanceWidth as number;
      // Keycap ends and whole keycaps are built to fit a label, not a cell, so they are left out.
      for (const e of faceEntries(spec).filter((x) => !x.name.startsWith('key.'))) {
        expect((e.placed.adv * PIXEL) % cell, `${file} ${e.name}`).toBe(0);
      }
    }
  });

  it('gives box-drawing glyphs the full mono advance so columns stay aligned', () => {
    for (const file of ['fizz-mono-regular', 'fizz-mono-bold']) {
      const m = parse(face(file));
      const cell = m.charToGlyph('A').advanceWidth as number;
      for (const ch of '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬') {
        expect(m.charToGlyph(ch).advanceWidth, `${file} ${ch}`).toBe(cell);
      }
    }
  });

  it('keeps a box line joined to the next cell after widening it', () => {
    const m = parse(face('fizz-mono-bold'));
    const box = m.charToGlyph('─').getBoundingBox();
    expect(box.x1).toBe(0);
    expect(box.x2).toBe(7 * PIXEL);
  });
});

describe('name table platforms', () => {
  it('writes the typographic names to every platform', () => {
    const n = parse(face('fizz-bold-oblique')).names as unknown as Record<
      string,
      Record<string, Record<string, string>>
    >;
    for (const platform of ['windows', 'unicode', 'macintosh']) {
      expect(n[platform]?.['preferredFamily']?.['en'], platform).toBe('Fizz');
      expect(n[platform]?.['preferredSubfamily']?.['en'], platform).toBe('Bold Oblique');
    }
  });
});
