// Tests for reading the player's keyboard layout: the map where the browser has one, and quiet where it does not.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { readLayoutMap, watchLayoutMap } from './key-labels';

const azerty = new Map([['KeyW', 'z']]);

describe('readLayoutMap', () => {
  it('gives the browser’s map', async () => {
    expect(await readLayoutMap({ keyboard: { getLayoutMap: async () => azerty } })).toBe(azerty);
  });

  it('is null without a Keyboard API, or when the browser refuses', async () => {
    expect(await readLayoutMap({})).toBeNull();
    expect(await readLayoutMap({ keyboard: {} })).toBeNull();
    const refused = {
      keyboard: {
        getLayoutMap: async () => {
          throw new Error('blocked');
        },
      },
    };
    expect(await readLayoutMap(refused)).toBeNull();
  });
});

describe('watchLayoutMap', () => {
  it('reads the map, and again on every layout change, until stopped', async () => {
    let fire: () => void = () => {};
    const removed = vi.fn();
    let map: ReadonlyMap<string, string> = azerty;
    const nav = {
      keyboard: {
        getLayoutMap: async () => map,
        addEventListener: (_: 'layoutchange', l: () => void) => (fire = l),
        removeEventListener: removed,
      },
    };
    const seen: (ReadonlyMap<string, string> | null)[] = [];
    const stop = watchLayoutMap((m) => seen.push(m), nav);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([azerty]);
    map = new Map([['KeyW', 'w']]);
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.length).toBe(2);
    expect(seen[1]?.get('KeyW')).toBe('w');
    stop();
    expect(removed).toHaveBeenCalledOnce();
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.length).toBe(2);
  });

  it('does nothing without a Keyboard API', () => {
    const onMap = vi.fn();
    watchLayoutMap(onMap, {})();
    expect(onMap).not.toHaveBeenCalled();
  });
});
