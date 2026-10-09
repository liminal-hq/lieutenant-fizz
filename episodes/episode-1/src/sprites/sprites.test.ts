// Tests the Episode 1 sprite set for unique names, sane sizes and atlas fit.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAtlas } from '@lieutenant-fizz/engine/atlas';
import { describe, expect, it } from 'vitest';
import { Sim } from '../sim/sim';
import { defineSprites } from './catalog';

describe('Episode 1 sprites', () => {
  const defs = defineSprites();

  it('has unique names and sane sizes', () => {
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const d of defs) {
      expect(d.grid.w).toBeGreaterThan(0);
      expect(d.grid.h).toBeGreaterThan(0);
      let opaque = 0;
      for (let y = 0; y < d.grid.h; y++)
        for (let x = 0; x < d.grid.w; x++) if (d.grid.at(x, y)) opaque++;
      expect(opaque, `${d.name} is blank`).toBeGreaterThan(0);
    }
  });

  it('draws the mural clue as five whole trees, each with its own glowing top and trunk', () => {
    const mural = defs.find((d) => d.name === 'mural')?.grid;
    expect(mural).toBeDefined();
    if (!mural) return;
    const count = (c: string): number => {
      let n = 0;
      for (let y = 0; y < mural.h; y++)
        for (let x = 0; x < mural.w; x++) if (mural.at(x, y) === c) n++;
      return n;
    };
    // Yellow is used for nothing else in the picture, so one glowing top per tree.
    expect(count('y')).toBe(5);
    expect(count('m')).toBeGreaterThan(5 * 6);
  });

  it('keeps tile sprites 16x16 and Ben 16 wide', () => {
    for (const d of defs.filter((s) => s.tile && !s.name.startsWith('ow') && s.name !== 'ladder')) {
      expect([d.name, d.grid.w, d.grid.h]).toEqual([d.name, 16, 16]);
    }
    expect(defs.find((d) => d.name === 'ben_stand')?.grid.w).toBe(16);
    expect(defs.find((d) => d.name === 'ben_pogo')?.grid.h).toBe(32);
  });

  it('draws three distinct 16x24 mantle frames for Ben', () => {
    const frames = ['ben_mantle1', 'ben_mantle2', 'ben_mantle3'].map((n) => {
      const g = defs.find((d) => d.name === n)?.grid;
      expect(g, n).toBeDefined();
      if (!g) throw new Error(n);
      expect([g.w, g.h]).toEqual([16, 24]);
      let cells = '';
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) cells += g.at(x, y) ?? '.';
      return cells;
    });
    expect(new Set(frames).size).toBe(3);
    // The head and shirt are Ben's, so a frame that lost them would show up as missing red or green.
    for (const f of frames) {
      expect(f).toContain('r');
      expect(f).toContain('g');
    }
  });

  it('packs into one 2048 atlas with room to spare', () => {
    const atlas = buildAtlas(defs);
    expect(Object.keys(atlas.rects)).toHaveLength(defs.length);
    const lowest = Math.max(...Object.values(atlas.rects).map((r) => 1 - r.v));
    expect(lowest).toBeLessThan(0.65);
  });

  const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
  it.skipIf(!existsSync(wasmPath))('contains every sprite the Rust sim draws', async () => {
    const sim = await Sim.load(readFileSync(wasmPath));
    const atlas = buildAtlas(defs);
    expect(() => sim.setSprites(atlas.rects)).not.toThrow();
  });
});
