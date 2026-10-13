// Works out the game's state at the moment a level was entered, from the events a play sample recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { num, type SessionEvent } from '@lieutenant-fizz/engine/session/log';

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
  /** The sim's pogo height at entry, when the log has it. */
  pogoH: number | null;
  /** The level's fingerprint when it was entered, when the log has it. */
  levelHash: number | null;
  /** True when the values were worked out from other events, not written down at the time. */
  inferred: boolean;
}

/**
 * How many ticks late an event of a sample recorded before revision 2 may be stamped: events were written when
 * the game drained them once a frame, which after a hitch could be a few ticks after the step that raised them.
 */
export const LATE_TICKS = 15;

/** The score of the next extra life: one hundred above the highest hundred reached. */
export const nextLifeFor = (score: number): number => Math.floor(score / 100) * 100 + 100;

/** The nearest event of a kind before `index`, or null. */
function lastBefore(
  events: readonly SessionEvent[],
  index: number,
  kind: string,
): SessionEvent | null {
  for (let i = index - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.e === kind) return e;
  }
  return null;
}

/**
 * The `st` that holds the state a level was entered with. The recorder writes one on the first sampled tick of a
 * level whenever the state differs from the last one written, and a death puts lives, ammo and score back to
 * their entry values, so an `st` on the entering step (it may come just before the `level` event in the file) or
 * in the three ticks after it is the entry state. When there is none, nothing had changed since the last `st`,
 * which is then the entry state; for the first level of a session the first `st` after is.
 */
function entryState(events: readonly SessionEvent[], levelIndex: number): SessionEvent | null {
  const tick = events[levelIndex]!.t;
  // The `level` event of an older sample may be stamped a few ticks late, so look back that far, and take the
  // earliest `st` there: the one written on the entering step.
  let entering: SessionEvent | null = null;
  for (let i = levelIndex - 1; i >= 0 && events[i]!.t >= tick - LATE_TICKS; i--) {
    if (events[i]!.e === 'st') entering = events[i]!;
  }
  if (entering) return entering;
  for (let i = levelIndex + 1; i < events.length && events[i]!.t <= tick + 3; i++) {
    const e = events[i]!;
    if (e.e === 'level') break;
    if (e.e === 'st') return e;
  }
  const before = lastBefore(events, levelIndex, 'st');
  if (before) return before;
  for (let i = levelIndex + 1; i < events.length; i++) {
    const e = events[i]!;
    if (e.e === 'level') break;
    if (e.e === 'st') return e;
  }
  return null;
}

/**
 * The entry state of the level whose `level` event is at `levelIndex`. A log of revision 2 or later has an
 * `enter` event right after it with everything written down at the time. Samples recorded before that have it
 * worked out here: the held input is the last `in` before the `level` event, and lives, ammo and score come
 * from the `st` that holds the entry state (see `entryState`). The cleared-levels mask is left at zero, which
 * only matters on the map.
 */
export function entryAt(events: readonly SessionEvent[], levelIndex: number): Entry | null {
  const level = events[levelIndex];
  if (!level || level.e !== 'level') return null;

  const enter = events[levelIndex + 1];
  if (enter?.e === 'enter' && num(enter, 'id', -1) === num(level, 'id')) {
    return {
      level: num(level, 'id'),
      tick: level.t,
      lives: num(enter, 'lives'),
      ammo: num(enter, 'ammo'),
      score: num(enter, 'score'),
      next: num(enter, 'next'),
      done: num(enter, 'done'),
      held: num(enter, 'held'),
      pogoH: typeof enter['pogoH'] === 'number' ? enter['pogoH'] : null,
      levelHash: typeof enter['lvh'] === 'number' ? enter['lvh'] : null,
      inferred: false,
    };
  }

  // The nearest `in` before the level event, even when its word is zero.
  const lastIn = lastBefore(events, levelIndex, 'in');
  const held = lastIn ? num(lastIn, 'b') : 0;
  const st = entryState(events, levelIndex);
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
    pogoH: null,
    levelHash: null,
    inferred: true,
  };
}
