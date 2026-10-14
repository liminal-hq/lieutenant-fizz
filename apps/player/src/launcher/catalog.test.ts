// Tests for the launcher's stops and save summaries.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import episodes from '../../../../site/episodes.json';
import {
  NO_SAVES,
  formatSaved,
  readSaves,
  slotLabel,
  stopsOf,
  type EpisodeInfo,
  type EpisodesFile,
} from './catalog';

const info: EpisodeInfo = {
  page: 'episode-1/index.html',
  saves: { auto: 'auto', slots: ['s1', 's2', 's3', 's4'] },
};
const save = (at: number): string => JSON.stringify({ v: 3, at, progress: { lives: 3 } });

describe('the stops', () => {
  it('lists each episode in order and then App settings, from the shared episodes file', () => {
    const stops = stopsOf(episodes as EpisodesFile);
    expect(stops.map((s) => s.kind)).toEqual(['episode', 'episode', 'episode', 'app']);
    expect(stops[0]).toMatchObject({ id: 'episode-1', number: 1, playable: true });
    expect(stops[1]).toMatchObject({ number: 2, playable: false, title: '' });
  });

  it('puts the episodes in number order whatever order the file has them in', () => {
    const file: EpisodesFile = {
      episodes: [
        { id: 'b', number: 2, status: 'coming-soon' },
        { id: 'a', number: 1, title: 'One', status: 'playable' },
      ],
    };
    expect(stopsOf(file).map((s) => (s.kind === 'episode' ? s.id : 'app'))).toEqual([
      'a',
      'b',
      'app',
    ]);
  });
});

describe("reading an episode's saves", () => {
  it('finds none in an empty store', () => {
    expect(readSaves(memoryStorage(), info)).toEqual(NO_SAVES);
  });

  it('finds each save and says which is newest, a tie going to the later slot', () => {
    const store = memoryStorage({ auto: save(100), s2: save(300), s3: save(300), s4: save(50) });
    const found = readSaves(store, info);
    expect(found.entries.map((e) => e.slot)).toEqual(['auto', 2, 3, 4]);
    expect(found.newest).toBe(3);
  });

  it('skips what is not a save', () => {
    const store = memoryStorage({
      auto: 'not json',
      s1: JSON.stringify({ at: 5 }),
      s2: JSON.stringify({ at: 'soon', progress: {} }),
      s3: save(7),
    });
    expect(readSaves(store, info).entries).toEqual([{ slot: 3, at: 7 }]);
  });

  it('counts a store that throws as having none', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSaves(broken, info)).toEqual(NO_SAVES);
  });
});

describe('naming saves', () => {
  it('calls the autosave Autosave and the others by number', () => {
    expect(slotLabel('auto')).toBe('Autosave');
    expect(slotLabel(2)).toBe('Slot 2');
  });

  it('writes a short date', () => {
    expect(formatSaved(Date.UTC(2026, 9, 7, 12), 'UTC')).toMatch(/Wed/);
    expect(formatSaved(Number.NaN)).toBe('');
  });
});
