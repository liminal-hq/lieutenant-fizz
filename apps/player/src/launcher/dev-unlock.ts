// Whether the debug menu row is showing: kept in the app's store so it stays after the app restarts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';

/** The store key. Every key the game owns starts with `lf-`. */
export const DEV_UNLOCK_KEY = 'lf-launcher-dev-v1';

/** True when the debug menu was unlocked and not hidden again. A store that cannot be read counts as locked. */
export function readUnlocked(store: Pick<KeyValueStorage, 'getItem'>): boolean {
  try {
    return store.getItem(DEV_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Saves the choice. Returns false when the store would not take it. */
export function writeUnlocked(
  store: Pick<KeyValueStorage, 'setItem' | 'removeItem'>,
  unlocked: boolean,
): boolean {
  try {
    if (unlocked) store.setItem(DEV_UNLOCK_KEY, '1');
    else store.removeItem(DEV_UNLOCK_KEY);
    return true;
  } catch {
    return false;
  }
}
