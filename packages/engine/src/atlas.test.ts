// Tests for the pixel pen and the sprite atlas packer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { buildAtlas } from './atlas';
import { Pen, spriteRng } from './pen';

describe('Pen', () => {
  it('draws pixels, rects and clips to bounds', () => {
    const p = new Pen(4, 4).rect(1, 1, 2, 2, 'r').px(-1, 0, 'g').px(9, 9, 'g');
    expect(p.at(1, 1)).toBe('r');
    expect(p.at(2, 2)).toBe('r');
    expect(p.at(0, 0)).toBeNull();
    expect(p.cells.filter(Boolean)).toHaveLength(4);
  });

  it('outlines opaque pixels without outlining the outline', () => {
    const p = new Pen(5, 5).px(2, 2, 'r').outline();
    expect(p.at(2, 2)).toBe('r');
    expect(p.at(1, 2)).toBe('k');
    expect(p.at(2, 1)).toBe('k');
    expect(p.at(1, 1)).toBeNull();
    expect(p.at(0, 2)).toBeNull();
  });

  it('fn rewrites only where a colour is returned', () => {
    const p = new Pen(2, 1)
      .px(0, 0, 'r')
      .fn((x, _y, c) => (x === 1 ? 'g' : c === 'r' ? undefined : null));
    expect(p.at(0, 0)).toBe('r');
    expect(p.at(1, 0)).toBe('g');
  });

  it('ellipses and lines fill expected cells', () => {
    const e = new Pen(8, 8).ell(4, 4, 3, 3, 'c');
    expect(e.at(4, 4)).toBe('c');
    expect(e.at(0, 0)).toBeNull();
    const l = new Pen(8, 8).line(0, 0, 7, 0, 'y');
    expect([...Array(8).keys()].every((x) => l.at(x, 0) === 'y')).toBe(true);
  });

  it('sprite rng is deterministic', () => {
    const a = spriteRng(5);
    const b = spriteRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('buildAtlas', () => {
  const sq = (c: 'r' | 'g', w = 4, h = 4): Pen => new Pen(w, h).rect(0, 0, w, h, c);

  it('packs sprites without overlap and keeps UVs inside the atlas', () => {
    const atlas = buildAtlas(
      [
        { name: 'a', grid: sq('r'), tile: false },
        { name: 'b', grid: sq('g', 8, 2), tile: true },
        { name: 'c', grid: sq('r', 6, 6), tile: false },
      ],
      { size: 128, scale: 4 },
    );
    const rs = Object.values(atlas.rects);
    for (const r of rs) {
      expect(r.u).toBeGreaterThanOrEqual(0);
      expect(r.v).toBeGreaterThanOrEqual(0);
      expect(r.u + r.uw).toBeLessThanOrEqual(1);
      expect(r.v + r.vh).toBeLessThanOrEqual(1);
    }
    const overlap = (p: (typeof rs)[number], q: (typeof rs)[number]): boolean =>
      p.u < q.u + q.uw && p.u + p.uw > q.u && p.v < q.v + q.vh && p.v + p.vh > q.v;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!)).toBe(false);
    }
    expect(atlas.rects['a']).toMatchObject({ w: 4, h: 4 });
  });

  it('writes 4x4 texel blocks of the palette colour, in GL row order', () => {
    const atlas = buildAtlas([{ name: 'a', grid: sq('r', 2, 2), tile: false }], {
      size: 32,
      scale: 4,
    });
    const r = atlas.rects['a']!;
    // Sample the centre of the sprite via UV -> texel (row 0 is the bottom in GL order).
    const tx = Math.floor((r.u + r.uw / 2) * 32);
    const ty = Math.floor((r.v + r.vh / 2) * 32);
    const o = (ty * 32 + tx) * 4;
    expect([...atlas.albedo.subarray(o, o + 4)]).toEqual([0xff, 0x55, 0x55, 255]);
    // A texel outside any sprite is fully transparent.
    expect(atlas.albedo[(31 * 32 + 31) * 4 + 3]).toBe(0);
  });

  it('extrudes a one texel border', () => {
    const atlas = buildAtlas([{ name: 'a', grid: sq('g', 2, 2), tile: false }], {
      size: 32,
      scale: 4,
    });
    const r = atlas.rects['a']!;
    const left = Math.round(r.u * 32) - 1;
    const ty = Math.floor((r.v + r.vh / 2) * 32);
    const o = (ty * 32 + left) * 4;
    expect(atlas.albedo[o + 3]).toBe(255);
    expect(atlas.albedo[o + 1]).toBe(0xff);
  });

  it('generates unit-ish normals that point out of the screen for flat colour', () => {
    const atlas = buildAtlas([{ name: 'a', grid: sq('g', 4, 4), tile: true }], {
      size: 64,
      scale: 2,
    });
    const r = atlas.rects['a']!;
    const tx = Math.floor((r.u + r.uw / 2) * 64);
    const ty = Math.floor((r.v + r.vh / 2) * 64);
    const o = (ty * 64 + tx) * 4;
    expect(atlas.normal[o]).toBeGreaterThan(120);
    expect(atlas.normal[o]).toBeLessThan(136);
    expect(atlas.normal[o + 2]).toBeGreaterThan(250);
  });

  it('rejects duplicate names and overflow', () => {
    expect(() =>
      buildAtlas([
        { name: 'a', grid: sq('r'), tile: false },
        { name: 'a', grid: sq('r'), tile: false },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      buildAtlas([{ name: 'big', grid: sq('r', 20, 20), tile: false }], { size: 32 }),
    ).toThrow(/full/);
  });
});
