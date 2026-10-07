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
    expect(counts[0]).toBe(303);
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
    expect(has('→←↑↓►◄▸♪')).toEqual([]);
    expect(has('─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬')).toEqual([]);
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
