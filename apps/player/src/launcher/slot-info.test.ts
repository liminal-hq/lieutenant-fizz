// Tests for the rows the launcher draws for saves.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import { readSaves, type EpisodeInfo } from './catalog';
import {
  parseOverworld,
  placeOf,
  readProgress,
  slotRowOf,
  type OverworldData,
  type SlotContext,
} from './slot-info';

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));
const palette = { areas: [1, 2], river: 3, nodeCleared: 4, nodeOpen: 5, ben: 6 };
/** A 2×2 overworld: area 0 along the bottom row (south) and area 1 along the top. */
const overworld: OverworldData = {
  w: 2,
  h: 2,
  cells: new Uint8Array([0, 0, 0x10, 0x10]),
  areas: new Uint8Array([0, 0, 1, 1]),
  palette,
};
const ctx: SlotContext = { levels: 8, areas: ['Crater Fields', 'Meadows'], overworld };
const save = (progress: object, at = Date.UTC(2026, 9, 7, 16)): string =>
  JSON.stringify({ v: 3, at, progress });
const noPicture = (): string => 'data:test';

describe('the overworld data', () => {
  it('reads what the build script writes and refuses what is not that shape', () => {
    const good = { w: 2, h: 1, cells: b64([1, 2]), areas: b64([0, 1]), palette };
    expect(parseOverworld(good)).toMatchObject({ w: 2, h: 1, palette });
    expect(parseOverworld({ ...good, cells: b64([1]) })).toBeUndefined();
    expect(parseOverworld({ ...good, w: 0 })).toBeUndefined();
    expect(parseOverworld({ ...good, areas: 5 })).toBeUndefined();
    expect(parseOverworld({ ...good, palette: null })).toBeUndefined();
    expect(parseOverworld(null)).toBeUndefined();
    expect(parseOverworld({ ...good, cells: '***' })).toBeUndefined();
  });
});

describe('reading a save', () => {
  it('needs a finite time and a progress object, and reads the numbers it shows', () => {
    expect(readProgress(save({ lives: 3, score: 9, doneMask: 5, played: 60 }))).toEqual({
      at: Date.UTC(2026, 9, 7, 16),
      lives: 3,
      score: 9,
      doneMask: 5,
      played: 60,
    });
    expect(readProgress(save({ lives: 3, map: { x: 1.5, y: 0.2 } }))?.map).toEqual({
      x: 1.5,
      y: 0.2,
    });
    expect(readProgress(save({ map: { x: 'a', y: 1 } }))?.map).toBeUndefined();
    expect(readProgress(save({}))?.lives).toBe(0);
    expect(readProgress(null)).toBeUndefined();
    expect(readProgress('nope')).toBeUndefined();
    expect(readProgress(JSON.stringify({ at: 'x', progress: {} }))).toBeUndefined();
    expect(readProgress(JSON.stringify({ at: 1 }))).toBeUndefined();
  });
});

describe('the place of a save', () => {
  it('is the area at its map position, and the first where that is not known', () => {
    expect(placeOf(ctx, { x: 0.5, y: 1.5 })).toBe('Meadows');
    expect(placeOf(ctx, { x: 1.2, y: 0.1 })).toBe('Crater Fields');
    expect(placeOf(ctx, { x: 9, y: 9 })).toBe('Crater Fields');
    expect(placeOf(ctx, undefined)).toBe('Crater Fields');
    expect(placeOf({ ...ctx, overworld: undefined }, { x: 0.5, y: 1.5 })).toBe('Crater Fields');
  });
});

describe('a save as a row', () => {
  it('has the title, lines, thumbnail and pips of the game’s Load game screen', () => {
    const progress = readProgress(
      save({ lives: 3, score: 1240, doneMask: 0b101, played: 2520, map: { x: 0.5, y: 1.5 } }),
    )!;
    const row = slotRowOf(2, progress, ctx, noPicture);
    expect(row).toMatchObject({
      title: 'Slot 2 · Meadows',
      brief: 'Lives 3 · 1,240 pts · 0:42',
      thumb: 'data:test',
      empty: false,
      cleared: 2,
      total: 8,
    });
    expect(row.detail).toContain('Lives 3 · 1,240 pts · 0:42 played');
    expect(slotRowOf('auto', progress, ctx, noPicture).detail).toMatch(/read-only$/);
  });

  it('has no picture where the overworld is not known, or the picture fails', () => {
    const progress = readProgress(save({ lives: 1 }))!;
    expect(slotRowOf(1, progress, { ...ctx, overworld: undefined }).thumb).toBe('');
    expect(
      slotRowOf(1, progress, ctx, () => {
        throw new Error('no canvas');
      }).thumb,
    ).toBe('');
  });
});

describe('the saves an episode has', () => {
  const info: EpisodeInfo = {
    page: 'p',
    saves: { auto: 'a', slots: ['s1'], levels: 8, areas: ['Crater Fields', 'Meadows'] },
  };

  it('carry their rows when the episode says how many levels it has', () => {
    const found = readSaves(
      memoryStorage({ a: save({ lives: 3 }, 5), s1: save({ lives: 2 }, 9) }),
      info,
    );
    expect(found.newest).toBe(1);
    expect(found.entries.map((e) => e.row?.title)).toEqual([
      'Autosave · Crater Fields',
      'Slot 1 · Crater Fields',
    ]);
  });

  it('have none for an episode that does not', () => {
    const bare: EpisodeInfo = { page: 'p', saves: { auto: 'a', slots: [] } };
    expect(readSaves(memoryStorage({ a: save({}, 5) }), bare).entries[0]).toEqual({
      slot: 'auto',
      at: 5,
    });
  });
});
