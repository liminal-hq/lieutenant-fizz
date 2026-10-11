// Serialises and restores Episode 1 progress through local storage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  flushable,
  localStorageAdapter,
  type KeyValueStorage,
} from '@lieutenant-fizz/engine/storage';
import { State } from './sim/protocol';
import type { Sim } from './sim/sim';

/** The autosave's storage key never changes; the version lives inside the saved JSON. */
export const SAVE_KEY = 'lf-ep1-save-v1';

/** How many manual save slots there are, besides the autosave. */
export const SLOT_COUNT = 4;

/** A save location: the read-only autosave, or a manual slot from 1 to {@link SLOT_COUNT}. */
export type SlotId = 'auto' | 1 | 2 | 3 | 4;

/** Every slot, autosave first. */
export const SLOT_IDS: readonly SlotId[] = ['auto', 1, 2, 3, 4];

/** The storage key of a slot. The autosave keeps the original key, so older saves still load. */
export const slotKey = (id: SlotId): string => (id === 'auto' ? SAVE_KEY : `lf-ep1-slot-${id}`);

/**
 * Version 3 adds the time played. Version 2 is the overworld with four areas, and a version 1 save
 * still loads (its progress is just as valid) but its map position belongs to the old layout and is
 * dropped, so the player starts on the map at the saucer rather than stranded in a region the old
 * position now falls in. Versions 1 and 2 load with no time played.
 */
export const SAVE_VERSION = 3;

/** Highest `doneMask` the sim understands: level bits 0 to 14 and the secret flag in bit 15. */
export const MAX_DONE_MASK = 0xffff;

/** Progress that survives between levels: what an autosave on every map visit stores. */
export interface Progress {
  lives: number;
  score: number;
  nextLife: number;
  ammo: number;
  /** Bit per cleared level (bit 0 is the first level), plus bit 15 once the secret is found. */
  doneMask: number;
  /** Seconds spent playing, in levels and on the map. Saves from before version 3 have none. */
  played: number;
  /** Where Ben stands on the overworld, if known. */
  map?: { x: number; y: number };
}

/** A save as stored: the version, when it was written, and the progress. */
export interface Stored {
  v: typeof SAVE_VERSION;
  at: number;
  progress: Progress;
}

/** The largest time, in milliseconds, a JavaScript Date can represent. */
const MAX_TIME = 8.64e15;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function serialise(progress: Progress, now = Date.now()): string {
  const s: Stored = { v: SAVE_VERSION, at: now, progress };
  return JSON.stringify(s);
}

/** Parses and validates a stored save; returns null for anything malformed. */
export function parseSave(json: string | null): Stored | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { v?: number; at?: number; progress?: unknown } | null;
    const p = raw?.progress as Partial<Progress> | undefined;
    if (!raw || (raw.v !== 1 && raw.v !== 2 && raw.v !== SAVE_VERSION) || !p || !finite(raw.at)) {
      return null;
    }
    // A timestamp a Date cannot hold would break the slot screen's date, so the save is ignored.
    if (Math.abs(raw.at) > MAX_TIME) return null;
    const { lives, score, nextLife, ammo, doneMask } = p;
    if (
      !finite(lives) ||
      !finite(score) ||
      !finite(nextLife) ||
      !finite(ammo) ||
      !finite(doneMask)
    ) {
      return null;
    }
    if (
      lives < 0 ||
      lives > 99 ||
      score < 0 ||
      ammo < 0 ||
      nextLife < 100 ||
      doneMask < 0 ||
      doneMask > MAX_DONE_MASK
    ) {
      return null;
    }
    // Saves before version 3 did not count time; a version 3 save must.
    let played = 0;
    if (raw.v === SAVE_VERSION) {
      if (!finite(p.played) || p.played < 0) return null;
      played = p.played;
    }
    // A version 1 position was recorded on the old map, so it is not trusted.
    const map =
      raw.v !== 1 && p.map && finite(p.map.x) && finite(p.map.y)
        ? { x: p.map.x, y: p.map.y }
        : undefined;
    return {
      v: SAVE_VERSION,
      at: raw.at,
      progress: { lives, score, nextLife, ammo, doneMask, played, ...(map ? { map } : {}) },
    };
  } catch {
    return null;
  }
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Writer = Pick<KeyValueStorage, 'setItem'>;

/** Reads one slot, or null when it is empty or unreadable. */
export function readSlot(store: Reader | null, id: SlotId): Stored | null {
  try {
    return parseSave(store?.getItem(slotKey(id)) ?? null);
  } catch {
    return null;
  }
}

/** Writes progress to a slot. Returns false when storage is missing, full or blocked. */
export function writeSlot(
  store: Writer | null,
  id: SlotId,
  progress: Progress,
  now = Date.now(),
): boolean {
  try {
    store?.setItem(slotKey(id), serialise(progress, now));
    return !!store;
  } catch {
    return false;
  }
}

/**
 * Confirms that what was just written reached the backing store. Returns null when the write was already
 * complete when `setItem` returned (the web's `localStorage`), so the caller can stay synchronous; otherwise a
 * promise of whether the store's background write succeeded (the Tauri app's file, which can be out of space).
 */
export function confirmWrite(store: KeyValueStorage | null): Promise<boolean> | null {
  return flushable(store)?.flush() ?? null;
}

/** Every slot with its save, or null for an empty one, autosave first. */
export function readSlots(store: Reader | null): { id: SlotId; save: Stored | null }[] {
  return SLOT_IDS.map((id) => ({ id, save: readSlot(store, id) }));
}

/** The slot written most recently, or null when there are no saves. Ties go to the later slot. */
export function newestSlot(store: Reader | null): SlotId | null {
  let best: { id: SlotId; at: number } | null = null;
  for (const { id, save } of readSlots(store)) {
    if (save && (!best || save.at >= best.at)) best = { id, at: save.at };
  }
  return best?.id ?? null;
}

/** The autosave's progress. */
export function readProgress(store: Reader | null): Progress | null {
  return readSlot(store, 'auto')?.progress ?? null;
}

/** Writes the autosave. */
export function writeProgress(store: Writer | null, progress: Progress): boolean {
  return writeSlot(store, 'auto', progress);
}

export function captureProgress(sim: Sim, played = 0): Progress {
  const has = sim.get(State.HAS_MAP_POS) === 1;
  return {
    lives: sim.get(State.LIVES),
    score: sim.get(State.SCORE),
    nextLife: sim.get(State.NEXT_LIFE),
    ammo: sim.get(State.AMMO),
    doneMask: sim.get(State.DONE_MASK),
    played,
    ...(has ? { map: { x: sim.get(State.MAP_X), y: sim.get(State.MAP_Y) } } : {}),
  };
}

export function applyProgress(sim: Sim, p: Progress): void {
  sim.set(State.LIVES, p.lives);
  sim.set(State.SCORE, p.score);
  sim.set(State.NEXT_LIFE, p.nextLife);
  sim.set(State.AMMO, p.ammo);
  sim.set(State.DONE_MASK, p.doneMask);
  if (p.map) {
    sim.set(State.MAP_X, p.map.x);
    sim.set(State.MAP_Y, p.map.y);
  } else sim.set(State.HAS_MAP_POS, 0);
}

/** The browser's `localStorage`, or null when it is blocked. The entry point normally gives the game its storage. */
export function safeStorage(): KeyValueStorage | null {
  return localStorageAdapter();
}
