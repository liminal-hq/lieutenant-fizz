// Tests for the saved debug unlock.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import { DEV_UNLOCK_KEY, readUnlocked, writeUnlocked } from './dev-unlock';

describe('the saved debug unlock', () => {
  it('starts locked, stays unlocked once saved and locks again when hidden', () => {
    const store = memoryStorage();
    expect(readUnlocked(store)).toBe(false);
    expect(writeUnlocked(store, true)).toBe(true);
    expect(store.getItem(DEV_UNLOCK_KEY)).toBe('1');
    expect(readUnlocked(store)).toBe(true);
    expect(writeUnlocked(store, false)).toBe(true);
    expect(readUnlocked(store)).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  it('counts a store that throws as locked, and says when a save failed', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readUnlocked(broken)).toBe(false);
    expect(writeUnlocked(broken, true)).toBe(false);
    expect(writeUnlocked(broken, false)).toBe(false);
  });
});
