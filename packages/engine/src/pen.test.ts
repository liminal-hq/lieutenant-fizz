// Tests the pixel-drawing pen and the deterministic sprite RNG.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Pen, spriteRng } from './pen';

const filled = (p: Pen): number => p.cells.filter((c) => c !== null).length;

describe('Pen', () => {
  it('starts transparent and reads out of bounds as transparent', () => {
    const p = new Pen(4, 3);
    expect(p.cells).toHaveLength(12);
    expect(filled(p)).toBe(0);
    expect(p.at(-1, 0)).toBeNull();
    expect(p.at(4, 0)).toBeNull();
    expect(p.at(0, 3)).toBeNull();
  });

  it('plots pixels, floors coordinates and clips out-of-bounds writes', () => {
    const p = new Pen(4, 3);
    p.px(1.9, 2.2, 'R').px(-1, 0, 'R').px(4, 0, 'R').px(0, 3, 'R');
    expect(p.at(1, 2)).toBe('R');
    expect(filled(p)).toBe(1);
    p.px(1, 2, null);
    expect(filled(p)).toBe(0);
  });

  it('fills rectangles and clips them to the grid', () => {
    const p = new Pen(4, 4).rect(2, 2, 5, 5, 'G');
    expect(filled(p)).toBe(4);
    expect(p.at(2, 2)).toBe('G');
    expect(p.at(1, 1)).toBeNull();
  });

  it('draws lines including both endpoints, and a single point', () => {
    const p = new Pen(5, 5).line(0, 0, 4, 4, 'W');
    for (let i = 0; i < 5; i++) expect(p.at(i, i)).toBe('W');
    expect(filled(p)).toBe(5);
    const q = new Pen(3, 3).line(1, 1, 1, 1, 'y');
    expect(filled(q)).toBe(1);
  });

  it('fills ellipses and honours the clip condition', () => {
    const full = new Pen(8, 8).ell(4, 4, 3, 3, 'B');
    expect(full.at(4, 4)).toBe('B');
    expect(full.at(0, 0)).toBeNull();
    const top = new Pen(8, 8).ell(4, 4, 3, 3, 'B', (_i, j) => j < 4);
    expect(top.at(4, 2)).toBe('B');
    expect(top.at(4, 5)).toBeNull();
    expect(filled(top)).toBeLessThan(filled(full));
  });

  it('rewrites cells with fn, leaving undefined results unchanged', () => {
    const p = new Pen(2, 2).px(0, 0, 'R');
    p.fn((x, y, c) => (c === 'R' ? 'G' : x === 1 && y === 1 ? 'B' : undefined));
    expect(p.at(0, 0)).toBe('G');
    expect(p.at(1, 1)).toBe('B');
    expect(p.at(1, 0)).toBeNull();
    p.fn(() => null);
    expect(filled(p)).toBe(0);
  });

  it('outlines opaque pixels without touching existing outline colour', () => {
    const p = new Pen(5, 5).px(2, 2, 'R').outline();
    expect(p.at(1, 2)).toBe('k');
    expect(p.at(3, 2)).toBe('k');
    expect(p.at(2, 1)).toBe('k');
    expect(p.at(2, 3)).toBe('k');
    expect(p.at(1, 1)).toBeNull();
    expect(filled(p)).toBe(5);
    const before = [...p.cells];
    p.outline();
    expect(p.cells).toEqual(before);
  });

  it('chains calls', () => {
    const p = new Pen(3, 3);
    expect(p.px(0, 0, 'R')).toBe(p);
    expect(p.rect(0, 0, 1, 1, 'R')).toBe(p);
  });
});

describe('spriteRng', () => {
  it('is deterministic per seed and returns values in [0, 1)', () => {
    const a = spriteRng(7);
    const b = spriteRng(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs between seeds and survives a zero seed', () => {
    const run = (s: number): number[] => {
      const r = spriteRng(s);
      return Array.from({ length: 8 }, () => r());
    };
    expect(run(1)).not.toEqual(run(2));
    expect(run(0).some((v) => v !== 0)).toBe(true);
  });
});
