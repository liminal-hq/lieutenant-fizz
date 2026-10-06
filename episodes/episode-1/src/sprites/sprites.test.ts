// Tests the Episode 1 sprite set for unique names, sane sizes and atlas fit.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAtlas } from '@lieutenant-fizz/engine';
import { describe, expect, it } from 'vitest';
import { Sim } from '../sim/sim';
import { defineSprites } from './index';

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

  it('keeps tile sprites 16x16 and Ben 16 wide', () => {
    for (const d of defs.filter((s) => s.tile && !s.name.startsWith('ow') && s.name !== 'ladder')) {
      expect([d.name, d.grid.w, d.grid.h]).toEqual([d.name, 16, 16]);
    }
    expect(defs.find((d) => d.name === 'ben_stand')?.grid.w).toBe(16);
    expect(defs.find((d) => d.name === 'ben_pogo')?.grid.h).toBe(32);
  });

  it('packs into one 2048 atlas with room to spare', () => {
    const atlas = buildAtlas(defs);
    expect(Object.keys(atlas.rects)).toHaveLength(defs.length);
    const lowest = Math.max(...Object.values(atlas.rects).map((r) => 1 - r.v));
    expect(lowest).toBeLessThan(0.6);
  });

  const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
  it.skipIf(!existsSync(wasmPath))('contains every sprite the Rust sim draws', async () => {
    const sim = await Sim.load(readFileSync(wasmPath));
    const atlas = buildAtlas(defs);
    expect(() => sim.setSprites(atlas.rects)).not.toThrow();
  });
});
