// Works out the game's state at the moment a level was entered, from the events a play sample recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { num, type LogEvent } from './log';

/** What the sim needs to be in before `enter_level` so the level starts as it did for the player. */
export interface Entry {
  /** The level id. */
  level: number;
  /** The recorded tick of the map step that entered the level; the first level step is one tick later. */
  tick: number;
  lives: number;
  ammo: number;
  score: number;
  /** The score at which the next extra life is given. */
  next: number;
  /** The cleared-levels mask. */
  done: number;
  /** The input word held on the step that entered the level; it becomes the sim's previous input. */
  held: number;
  /** True when the values were worked out from other events, not written down at the time. */
  inferred: boolean;
}

/** The score of the next extra life: one hundred above the highest hundred reached. */
export const nextLifeFor = (score: number): number => Math.floor(score / 100) * 100 + 100;

/** The nearest event of a kind before `index`, or null. */
function lastBefore(events: readonly LogEvent[], index: number, kind: string): LogEvent | null {
  for (let i = index - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.e === kind) return e;
  }
  return null;
}

/**
 * The entry state of the level whose `level` event is at `levelIndex`. Samples recorded before the entry state
 * was written down have it worked out here: the held input is the last `in` before the `level` event, and lives,
 * ammo and score are the last `st` before it (the previous attempt's final values, since a level is only
 * entered from the map, where they do not change), or, for the first level of a session, the first `st` after.
 * The cleared-levels mask is left at zero, which only matters on the map.
 */
export function entryAt(events: readonly LogEvent[], levelIndex: number): Entry | null {
  const level = events[levelIndex];
  if (!level || level.e !== 'level') return null;

  // The nearest `in` before the level event, even when its word is zero.
  const lastIn = lastBefore(events, levelIndex, 'in');
  const held = lastIn ? num(lastIn, 'b') : 0;
  let st = lastBefore(events, levelIndex, 'st');
  if (!st) {
    for (let i = levelIndex + 1; i < events.length; i++) {
      const e = events[i]!;
      if (e.e === 'level') break;
      if (e.e === 'st') {
        st = e;
        break;
      }
    }
  }
  if (!st) return null;
  const score = num(st, 'score');
  return {
    level: num(level, 'id'),
    tick: level.t,
    lives: num(st, 'lives'),
    ammo: num(st, 'ammo'),
    score,
    next: nextLifeFor(score),
    done: 0,
    held,
    inferred: true,
  };
}
