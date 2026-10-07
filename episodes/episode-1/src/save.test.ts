// Tests for saving, parsing and reading Episode 1 progress.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { parseSave, readProgress, SAVE_KEY, serialise, writeProgress, type Progress } from './save';

const progress: Progress = {
  lives: 3,
  score: 120,
  nextLife: 200,
  ammo: 7,
  doneMask: 3,
  map: { x: 12.2, y: 29 },
};

describe('save', () => {
  it('round-trips progress', () => {
    const parsed = parseSave(serialise(progress, 123));
    expect(parsed).toEqual({ v: 1, at: 123, progress });
  });

  it('accepts the whole level range and the secret flag, and loads three-level saves', () => {
    const wide = { ...progress, doneMask: 0x8000 | 0x3fff };
    expect(parseSave(serialise(wide, 5))?.progress.doneMask).toBe(wide.doneMask);
    expect(parseSave(serialise({ ...progress, doneMask: 7 }, 5))?.progress.doneMask).toBe(7);
  });

  it('rejects malformed, tampered or out-of-range saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('{"v":2,"at":1,"progress":{}}')).toBeNull();
    expect(parseSave(serialise({ ...progress, lives: -1 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, lives: 1e9 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, doneMask: 0x10000 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, doneMask: -1 }))).toBeNull();
    expect(
      parseSave(JSON.stringify({ v: 1, at: 1, progress: { ...progress, score: 'x' } })),
    ).toBeNull();
  });

  it('drops an invalid map position but keeps the rest', () => {
    const json = JSON.stringify({ v: 1, at: 1, progress: { ...progress, map: { x: 'a', y: 2 } } });
    const p = parseSave(json)?.progress;
    expect(p).toBeDefined();
    expect(p?.map).toBeUndefined();
  });

  it('reads and writes through a storage object and survives a broken one', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    expect(readProgress(store)).toBeNull();
    expect(writeProgress(store, progress)).toBe(true);
    expect(mem.has(SAVE_KEY)).toBe(true);
    expect(readProgress(store)).toEqual(progress);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readProgress(broken)).toBeNull();
    expect(writeProgress(broken, progress)).toBe(false);
    expect(writeProgress(null, progress)).toBe(false);
  });
});
