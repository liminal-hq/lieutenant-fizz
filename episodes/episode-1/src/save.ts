// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { State } from './sim/protocol';
import type { Sim } from './sim/sim';

export const SAVE_KEY = 'lf-ep1-save-v1';

/** Progress that survives between levels: what an autosave on every map visit stores. */
export interface Progress {
  lives: number;
  score: number;
  nextLife: number;
  ammo: number;
  /** Bit per cleared level (crater, caves, citadel). */
  doneMask: number;
  /** Where Ben stands on the overworld, if known. */
  map?: { x: number; y: number };
}

interface Stored {
  v: 1;
  at: number;
  progress: Progress;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function serialise(progress: Progress, now = Date.now()): string {
  const s: Stored = { v: 1, at: now, progress };
  return JSON.stringify(s);
}

/** Parses and validates a stored save; returns null for anything malformed. */
export function parseSave(json: string | null): Stored | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<Stored> | null;
    const p = raw?.progress as Partial<Progress> | undefined;
    if (!raw || raw.v !== 1 || !p || !finite(raw.at)) return null;
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
      doneMask > 7
    ) {
      return null;
    }
    const map =
      p.map && finite(p.map.x) && finite(p.map.y) ? { x: p.map.x, y: p.map.y } : undefined;
    return {
      v: 1,
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
