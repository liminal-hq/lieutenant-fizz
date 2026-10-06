// Tests that the opening cinematic only uses atlas sprites and stays deterministic.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildAtlas, InstanceWriter } from '@lieutenant-fizz/engine';
import { describe, expect, it } from 'vitest';
import { Cinematic, hashf } from './cine';
import { defineSprites } from './sprites';

describe('hashf', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(hashf(3, 4)).toBe(hashf(3, 4));
    for (let i = 0; i < 100; i++) expect(hashf(i, 9)).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 100; i++) expect(hashf(i, 9)).toBeLessThan(1);
  });
});

describe('Cinematic', () => {
  const atlas = buildAtlas(defineSprites());

  it('draws every scene using only sprites that exist, with finite data', () => {
    const buf = new Float32Array(20 * 5000);
    for (let stage = 0; stage < 8; stage++) {
      const w = new InstanceWriter(buf, atlas.rects);
      const c = new Cinematic(() => 0.5);
      c.start(stage);
      for (let i = 0; i < 300; i++) c.tick(1 / 60);
      w.reset();
      c.draw(w);
      expect(w.n, `stage ${stage}`).toBeGreaterThan(5);
      expect(buf.subarray(0, w.n * 20).every(Number.isFinite)).toBe(true);
    }
  });

  it('only references sprites present in the atlas', () => {
    const missing = new Set<string>();
    const rects = new Proxy(atlas.rects, {
      get(t, k: string) {
        const v = t[k];
        if (!v) missing.add(k);
        return v;
      },
    });
    for (let stage = 0; stage < 8; stage++) {
      const w = new InstanceWriter(new Float32Array(20 * 5000), rects);
      const c = new Cinematic(() => 0.5);
      c.start(stage);
      for (let i = 0; i < 200; i++) c.tick(1 / 60);
      c.draw(w);
    }
    expect([...missing]).toEqual([]);
  });
});
