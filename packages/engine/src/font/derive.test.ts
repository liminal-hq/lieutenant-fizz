// Tests for the pure glyph derivations behind the Fizz font.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  SPACE_ADVANCE,
  blank,
  bold,
  boxDrawing,
  composeAccents,
  condense,
  cutGlyph,
  masterGlyphs,
  monoCell,
  monoPlace,
  oblique,
  parse,
  trim,
  width,
} from './derive';

const show = (g: number[][]): string =>
  g.map((r) => r.map((v) => (v ? '#' : '.')).join('')).join('/');
const ink = (g: number[][]): number => g.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);

describe('master glyphs', () => {
  const master = masterGlyphs();

  it('pads every glyph to the full 11-row cell', () => {
    for (const [ch, g] of Object.entries(master)) expect(g.length, ch).toBe(11);
  });

  it('puts capitals on rows 2 to 8 and leaves the accent rows empty', () => {
    const a = master['A'] as number[][];
    expect(a.slice(0, 2).flat().includes(1)).toBe(false);
    expect(a.slice(2, 9).flat().includes(1)).toBe(true);
    expect(a.slice(9).flat().includes(1)).toBe(false);
  });

  it('uses the two descender rows for g, j, p, q and y', () => {
    for (const ch of 'gjpqy') {
      expect((master[ch] as number[][]).slice(9).flat().includes(1), ch).toBe(true);
    }
  });

  it('covers the Canadian French accents and the dotless i', () => {
    for (const ch of 'éèêëàâçôûùîïÉÈÊÀÇÔı') expect(master[ch], ch).toBeDefined();
  });

  it('has the glyphs the brief asks for beyond the basic letters', () => {
    for (const ch of '‽“”‘’—–·…«»×→←↑↓↙►◄▸♪●○▌{}<>@$^_|~`\\') expect(master[ch], ch).toBeDefined();
    for (const ch of '🙂😀😉😮😢😠😎❤⭐✓✗👍🍁👽🛸🥤☕💾🎮🔊🔇🔒⚡🏆')
      expect(master[ch], ch).toBeDefined();
  });
});

describe('accent composition', () => {
  const master = masterGlyphs();

  it('sits a lowercase mark three rows above the x-height and leaves the letter alone', () => {
    const e = master['e'] as number[][];
    const eAcute = master['é'] as number[][];
    expect(eAcute.slice(3)).toEqual(e.slice(3));
    expect(eAcute[1]?.some(Boolean) || eAcute[2]?.some(Boolean)).toBe(true);
  });

  it('puts a capital mark in the two accent rows', () => {
    const g = master['É'] as number[][];
    expect(g.slice(0, 2).flat().includes(1)).toBe(true);
    expect(g.slice(2)).toEqual((master['E'] as number[][]).slice(2));
  });

  it('hangs the cedilla in the descender rows', () => {
    expect((master['ç'] as number[][]).slice(9).flat().includes(1)).toBe(true);
    expect((master['c'] as number[][]).slice(9).flat().includes(1)).toBe(false);
  });

  it('builds î and ï on the dotless ı', () => {
    const base = composeAccents({ i: master['i'] as number[][], e: master['e'] as number[][] });
    expect(base['ı']?.slice(0, 4).flat().includes(1)).toBe(false);
    expect(base['ı']?.slice(4)).toEqual((master['i'] as number[][]).slice(4));
  });
});

describe('box drawing', () => {
  const box = boxDrawing();

  it('fills the whole cell: 6 wide, 11 tall', () => {
    for (const [ch, g] of Object.entries(box)) {
      expect(g.length, ch).toBe(11);
      expect(width(g), ch).toBe(6);
    }
  });

  it('runs lines edge to edge so neighbours join', () => {
    const h = box['─'] as number[][];
    expect(h[5]?.every(Boolean)).toBe(true);
    const v = box['│'] as number[][];
    expect(v.every((r) => r[2] === 1)).toBe(true);
    const corner = box['┌'] as number[][];
    expect(corner[5]?.[5]).toBe(1);
    expect(corner[10]?.[2]).toBe(1);
  });

  it('draws double lines as two parallel strokes', () => {
    const h = box['═'] as number[][];
    expect(h[4]?.every(Boolean) && h[6]?.every(Boolean)).toBe(true);
    expect(h[5]?.some(Boolean)).toBe(false);
  });

  it('has tees and crosses for both weights', () => {
    for (const ch of '├┤┬┴┼╠╣╦╩╬') expect(box[ch], ch).toBeDefined();
  });
});

describe('bold', () => {
  it('thickens strokes by one pixel to the right', () => {
    expect(show(bold(parse('###')))).toBe('####');
  });

  it('keeps a one-pixel gap between strokes open', () => {
    expect(show(bold(parse('#.#')))).toBe('#.##');
  });

  it('is one pixel wider than the regular glyph', () => {
    const h = masterGlyphs()['H'] as number[][];
    expect(width(bold(h))).toBe(width(h) + 1);
  });
});

describe('condensed', () => {
  it('merges the middle three columns of a five-wide glyph', () => {
    expect(show(condense(parse('#...#/.###./#####'), 'E'))).toBe('#..#/.##./####');
  });

  it('leaves exempt glyphs at full width', () => {
    const master = masterGlyphs();
    for (const ch of 'MWmw1%#*×&+=/…«»—–→←↑↓►◄▸') {
      const g = master[ch] as number[][];
      expect(width(condense(g, ch)), ch).toBe(width(g));
    }
  });

  it('leaves glyphs that are not five wide alone', () => {
    const i = masterGlyphs()['I'] as number[][];
    expect(condense(i, 'I')).toEqual(i);
  });
});

describe('oblique', () => {
  const base = 8;

  it('shears one pixel per three rows above the baseline', () => {
    const s = oblique(
      blank(1, 11).map(() => [1]),
      base,
    );
    const first = s.rows.map((r) => r.indexOf(1));
    expect(first).toEqual([3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0]);
  });

  it('keeps the advance at the unslanted width and reports a leftward offset', () => {
    const a = masterGlyphs()['A'] as number[][];
    const s = oblique(a, base);
    expect(s.adv).toBe(5);
    expect(s.ox).toBe(-1);
    expect(width(s.rows)).toBe(8);
    expect(ink(s.rows)).toBe(ink(a));
  });
});

describe('cuts and advances', () => {
  const master = masterGlyphs();

  it('adds a one-pixel gap after ordinary glyphs', () => {
    expect(cutGlyph('A', master['A'] as number[][], 'regular').adv).toBe(6);
    expect(cutGlyph('A', master['A'] as number[][], 'bold').adv).toBe(7);
    expect(cutGlyph('A', master['A'] as number[][], 'condensed').adv).toBe(5);
    expect(cutGlyph('A', master['A'] as number[][], 'oblique').adv).toBe(6);
  });

  it('gives box drawing exactly its width so lines meet', () => {
    expect(cutGlyph('─', master['─'] as number[][], 'bold').adv).toBe(6);
  });

  it('leaves pictures alone in every cut', () => {
    const g = master['🙂'] as number[][];
    expect(cutGlyph('🙂', g, 'bold').rows).toEqual(g);
    expect(cutGlyph('🙂', g, 'condensed').rows).toEqual(g);
  });

  it('uses a three-pixel space', () => {
    expect(SPACE_ADVANCE).toBe(3);
  });
});

describe('mono cell', () => {
  const master = masterGlyphs();

  it('is the widest letter or digit in the cut', () => {
    expect(monoCell(master, 'regular')).toBe(5);
    expect(monoCell(master, 'bold')).toBe(6);
    expect(monoCell(master, 'condensed')).toBe(4);
  });

  it('centres glyphs in the cell and advances cell + 1', () => {
    const i = cutGlyph('i', master['i'] as number[][], 'regular');
    const p = monoPlace('i', i, 5);
    expect(width(p.rows)).toBe(3);
    expect(p.ox).toBe(1);
    expect(p.adv).toBe(6);
  });

  it('never moves a glyph wider than the cell to the left', () => {
    const g = cutGlyph('🙂', master['🙂'] as number[][], 'regular');
    const p = monoPlace('🙂', g, 5);
    expect(p.ox).toBe(0);
    expect(p.adv).toBe(8);
  });

  it('trims blank columns', () => {
    expect(show(trim(parse('..#../..#..')))).toBe('#/#');
  });
});
