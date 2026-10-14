// Remembering which carousel stop the player left on, so the launcher opens there next time.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import type { Stop } from './catalog';

/** The store key. Every key the game owns starts with `lf-`. */
export const STOP_KEY = 'lf-launcher-stop-v1';

/** What the store holds for a stop: the episode's id, or `app` for App settings. */
export const stopId = (stop: Stop): string => (stop.kind === 'episode' ? stop.id : 'app');

/** The index of the stop the player left on, or the first stop when nothing is saved or it is no longer there. */
export function readStop(store: Pick<KeyValueStorage, 'getItem'>, stops: readonly Stop[]): number {
  try {
    const saved = store.getItem(STOP_KEY);
    const at = saved === null ? -1 : stops.findIndex((s) => stopId(s) === saved);
    return at >= 0 ? at : 0;
  } catch {
    return 0;
  }
}

/** Remembers a stop. Returns false when the store would not take it (nothing is lost but the memory). */
export function writeStop(store: Pick<KeyValueStorage, 'setItem'>, stop: Stop): boolean {
  try {
    store.setItem(STOP_KEY, stopId(stop));
    return true;
  } catch {
    return false;
  }
}
