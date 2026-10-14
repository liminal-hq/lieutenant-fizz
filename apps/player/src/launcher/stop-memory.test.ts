// Tests for remembering the carousel stop.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import { stopsOf } from './catalog';
import { STOP_KEY, readStop, stopId, writeStop } from './stop-memory';

const stops = stopsOf({
  episodes: [
    { id: 'episode-1', number: 1, title: 'One', status: 'playable' },
    { id: 'episode-2', number: 2, status: 'coming-soon' },
  ],
});

describe('remembering the stop', () => {
  it('names an episode by its id and App settings as app', () => {
    expect(stops.map(stopId)).toEqual(['episode-1', 'episode-2', 'app']);
  });

  it('opens on the stop that was saved, and on the first when nothing is saved', () => {
    const store = memoryStorage();
    expect(readStop(store, stops)).toBe(0);
    writeStop(store, stops[2]!);
    expect(store.getItem(STOP_KEY)).toBe('app');
    expect(readStop(store, stops)).toBe(2);
    writeStop(store, stops[1]!);
    expect(readStop(store, stops)).toBe(1);
  });

  it('opens on the first stop when the saved one is no longer there', () => {
    const store = memoryStorage({ [STOP_KEY]: 'episode-9' });
    expect(readStop(store, stops)).toBe(0);
  });

  it('copes with a store that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readStop(broken, stops)).toBe(0);
    expect(writeStop(broken, stops[0]!)).toBe(false);
  });
});
