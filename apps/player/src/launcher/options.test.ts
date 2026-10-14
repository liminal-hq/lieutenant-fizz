// Tests for the launcher's side of the shared options.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_OPTIONS } from '@lieutenant-fizz/engine/options';
import { OPTIONS_FILE_KEY } from '@lieutenant-fizz/engine/options-file';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import type { EpisodeInfo } from './catalog';
import { optionsSourceOf, readGlobal, resetGlobal, volumeOf, writeGlobal } from './options';

const info = (episode: string, own: string[] = ['layout']): EpisodeInfo => ({
  page: `${episode}/index.html`,
  saves: { auto: 'a', slots: [] },
  options: { episode, legacyKey: `lf-${episode}-options-v1`, ownKeys: own },
});

describe('where the launcher finds the options', () => {
  it("collects each episode's old key and the options only an episode has", () => {
    const source = optionsSourceOf([
      info('e1', ['layout', 'captions']),
      undefined,
      info('e2', ['layout']),
    ]);
    expect(source.legacy).toEqual([
      { episode: 'e1', key: 'lf-e1-options-v1' },
      { episode: 'e2', key: 'lf-e2-options-v1' },
    ]);
    expect([...source.ownKeys].sort()).toEqual(['captions', 'layout']);
    expect(optionsSourceOf([{ page: 'x', saves: { auto: 'a', slots: [] } }])).toEqual({
      legacy: [],
      ownKeys: [],
    });
  });
});

describe('reading and saving the app-wide values', () => {
  const source = optionsSourceOf([info('e1')]);

  it('reads the defaults from an empty store', () => {
    expect(readGlobal(memoryStorage(), source)).toEqual(DEFAULT_GLOBAL_OPTIONS);
  });

  it('carries over what an older build saved, without writing it', () => {
    const store = memoryStorage({
      'lf-e1-options-v1': JSON.stringify({ v: 1, sfx: 3, layout: 1 }),
    });
    expect(readGlobal(store, source).sfx).toBe(3);
    expect(store.getItem(OPTIONS_FILE_KEY)).toBeNull();
  });

  it("saves one value and keeps the rest, including an episode's own section and carried-over values", () => {
    const store = memoryStorage({
      'lf-e1-options-v1': JSON.stringify({ v: 1, sfx: 3, layout: 1 }),
    });
    expect(writeGlobal(store, source, 'music', 2)).toBe(true);
    const file = JSON.parse(store.getItem(OPTIONS_FILE_KEY) ?? '{}');
    expect(file.global).toEqual({ sfx: 3, music: 2 });
    expect(file.episodes.e1).toEqual({ layout: 1 });
    expect(readGlobal(store, source)).toMatchObject({ sfx: 3, music: 2 });
  });

  it('does not overwrite a change made since it last looked', () => {
    const store = memoryStorage();
    writeGlobal(store, source, 'music', 2);
    // A game saves another value in the same file...
    const file = JSON.parse(store.getItem(OPTIONS_FILE_KEY) ?? '{}');
    file.global.sfx = 1;
    store.setItem(OPTIONS_FILE_KEY, JSON.stringify(file));
    // ...and the launcher's next save keeps it.
    writeGlobal(store, source, 'text', 1);
    expect(readGlobal(store, source)).toMatchObject({ music: 2, sfx: 1, text: 1 });
  });

  it('puts some options back to their defaults and leaves the rest', () => {
    const store = memoryStorage();
    writeGlobal(store, source, 'music', 2);
    writeGlobal(store, source, 'sfx', 3);
    writeGlobal(store, source, 'text', 1);
    expect(resetGlobal(store, source, ['music', 'sfx'])).toBe(true);
    expect(readGlobal(store, source)).toMatchObject({ music: 8, sfx: 8, text: 1 });
  });

  it('copes with a store that throws, and no store', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readGlobal(broken, source)).toEqual(DEFAULT_GLOBAL_OPTIONS);
    expect(writeGlobal(broken, source, 'music', 1)).toBe(false);
    expect(resetGlobal(broken, source, ['music'])).toBe(false);
    expect(writeGlobal(null, source, 'music', 1)).toBe(false);
    expect(resetGlobal(null, source, ['music'])).toBe(false);
  });

  it('turns a meter level into a volume', () => {
    expect(volumeOf(8)).toBe(1);
    expect(volumeOf(4)).toBe(0.5);
    expect(volumeOf(0)).toBe(0);
  });
});
