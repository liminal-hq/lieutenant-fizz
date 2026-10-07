// Serialises and restores Episode 1 progress through local storage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { State } from './sim/protocol';
import type { Sim } from './sim/sim';

/** The storage key never changes; the version lives inside the saved JSON. */
export const SAVE_KEY = 'lf-ep1-save-v1';

/**
 * Version 2 is the overworld with four areas. A version 1 save still loads (its progress is just as
 * valid), but its map position belongs to the old layout and is dropped, so the player starts on
 * the map at the saucer rather than stranded in a region the old position now falls in.
 */
export const SAVE_VERSION = 2;

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
  /** Where Ben stands on the overworld, if known. */
  map?: { x: number; y: number };
}

interface Stored {
  v: typeof SAVE_VERSION;
  at: number;
  progress: Progress;
}

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
    if (!raw || (raw.v !== 1 && raw.v !== SAVE_VERSION) || !p || !finite(raw.at)) return null;
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
    // A version 1 position was recorded on the old map, so it is not trusted.
    const map =
      raw.v === SAVE_VERSION && p.map && finite(p.map.x) && finite(p.map.y)
        ? { x: p.map.x, y: p.map.y }
        : undefined;
    return {
      v: SAVE_VERSION,
      at: raw.at,
      progress: { lives, score, nextLife, ammo, doneMask, ...(map ? { map } : {}) },
    };
  } catch {
    return null;
  }
}

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

export function readProgress(store: Reader | null): Progress | null {
  try {
    return parseSave(store?.getItem(SAVE_KEY) ?? null)?.progress ?? null;
  } catch {
    return null;
  }
}

export function writeProgress(store: Writer | null, progress: Progress): boolean {
  try {
    store?.setItem(SAVE_KEY, serialise(progress));
    return !!store;
  } catch {
    return false;
  }
}

export function captureProgress(sim: Sim): Progress {
  const has = sim.get(State.HAS_MAP_POS) === 1;
  return {
    lives: sim.get(State.LIVES),
    score: sim.get(State.SCORE),
    nextLife: sim.get(State.NEXT_LIFE),
    ammo: sim.get(State.AMMO),
    doneMask: sim.get(State.DONE_MASK),
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

export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
