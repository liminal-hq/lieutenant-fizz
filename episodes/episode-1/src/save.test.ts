// Tests for saving, parsing and reading Episode 1 progress.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  newestSlot,
  parseSave,
  readProgress,
  readSlot,
  readSlots,
  SAVE_KEY,
  SAVE_VERSION,
  serialise,
  SLOT_IDS,
  slotKey,
  writeProgress,
  writeSlot,
  type Progress,
} from './save';

const progress: Progress = {
  lives: 3,
  score: 120,
  nextLife: 200,
  ammo: 7,
  doneMask: 3,
  played: 1520,
  map: { x: 12.2, y: 29 },
};

describe('save', () => {
  it('round-trips progress', () => {
    const parsed = parseSave(serialise(progress, 123));
    expect(parsed).toEqual({ v: 3, at: 123, progress });
  });

  it('accepts the whole level range and the secret flag, and loads three-level saves', () => {
    const wide = { ...progress, doneMask: 0x8000 | 0x3fff };
    expect(parseSave(serialise(wide, 5))?.progress.doneMask).toBe(wide.doneMask);
    expect(parseSave(serialise({ ...progress, doneMask: 7 }, 5))?.progress.doneMask).toBe(7);
  });

  it('rejects malformed, tampered or out-of-range saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('{"v":4,"at":1,"progress":{}}')).toBeNull();
    expect(parseSave('{"v":3,"at":1,"progress":{}}')).toBeNull();
    expect(parseSave(serialise({ ...progress, lives: -1 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, lives: 1e9 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, doneMask: 0x10000 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, doneMask: -1 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, played: -5 }))).toBeNull();
    expect(parseSave(serialise({ ...progress, played: Number.NaN }))).toBeNull();
    expect(
      parseSave(JSON.stringify({ v: 1, at: 1, progress: { ...progress, score: 'x' } })),
    ).toBeNull();
  });

  it('loads a version 1 save but drops its map position, which belongs to the old map', () => {
    const { played: _played, ...before } = progress;
    const old = JSON.stringify({ v: 1, at: 9, progress: before });
    const parsed = parseSave(old);
    expect(parsed?.v).toBe(SAVE_VERSION);
    expect(parsed?.progress.played).toBe(0);
    expect(parsed?.progress.doneMask).toBe(progress.doneMask);
    expect(parsed?.progress.lives).toBe(progress.lives);
    expect(parsed?.progress.map).toBeUndefined();
  });

  it('writes version 3 and keeps the map position and time played', () => {
    const parsed = parseSave(serialise(progress, 5));
    expect(parsed?.v).toBe(3);
    expect(parsed?.progress.map).toEqual(progress.map);
    expect(parsed?.progress.played).toBe(1520);
  });

  it('migrates a version 2 save: map kept, no time played', () => {
    const { played: _played, ...before } = progress;
    const parsed = parseSave(JSON.stringify({ v: 2, at: 4, progress: before }));
    expect(parsed?.v).toBe(3);
    expect(parsed?.at).toBe(4);
    expect(parsed?.progress.map).toEqual(progress.map);
    expect(parsed?.progress.played).toBe(0);
  });

  it('drops an invalid map position but keeps the rest', () => {
    const json = JSON.stringify({ v: 3, at: 1, progress: { ...progress, map: { x: 'a', y: 2 } } });
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

describe('save slots', () => {
  const memory = () => {
    const mem = new Map<string, string>();
    return {
      mem,
      store: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
      },
    };
  };

  it('keeps the autosave at the original key and gives each slot its own', () => {
    expect(slotKey('auto')).toBe(SAVE_KEY);
    expect(slotKey(1)).toBe('lf-ep1-slot-1');
    expect(slotKey(4)).toBe('lf-ep1-slot-4');
    expect(new Set(SLOT_IDS.map(slotKey)).size).toBe(5);
  });

  it('writes and reads a slot without touching the others', () => {
    const { store, mem } = memory();
    expect(writeSlot(store, 2, progress, 50)).toBe(true);
    expect(mem.has('lf-ep1-slot-2')).toBe(true);
    expect(readSlot(store, 2)?.progress).toEqual(progress);
    expect(readSlot(store, 1)).toBeNull();
    expect(readProgress(store)).toBeNull();
  });

  it('lists every slot, autosave first, with null for the empty ones', () => {
    const { store } = memory();
    writeProgress(store, progress);
    writeSlot(store, 3, { ...progress, lives: 1 });
    const slots = readSlots(store);
    expect(slots.map((s) => s.id)).toEqual(['auto', 1, 2, 3, 4]);
    expect(slots.map((s) => s.save !== null)).toEqual([true, false, false, true, false]);
  });

  it('finds the slot written most recently, and none when there are no saves', () => {
    const { store } = memory();
    expect(newestSlot(store)).toBeNull();
    writeSlot(store, 'auto', progress, 100);
    writeSlot(store, 1, progress, 300);
    writeSlot(store, 2, progress, 200);
    expect(newestSlot(store)).toBe(1);
    writeSlot(store, 4, progress, 300);
    expect(newestSlot(store)).toBe(4);
  });

  it('ignores a corrupt slot and survives a broken store', () => {
    const { store, mem } = memory();
    mem.set('lf-ep1-slot-1', '{oops');
    writeSlot(store, 2, progress, 10);
    expect(readSlot(store, 1)).toBeNull();
    expect(newestSlot(store)).toBe(2);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readSlots(broken).every((s) => s.save === null)).toBe(true);
    expect(newestSlot(broken)).toBeNull();
    expect(writeSlot(broken, 1, progress)).toBe(false);
  });
});
