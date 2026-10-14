// Cuts a session into attempts at a level: from entering it to clearing it, dying in it or leaving it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Session } from '@lieutenant-fizz/engine/session/log';

export type Outcome = 'clear' | 'died' | 'left' | 'open';

export interface PathPoint {
  x: number;
  y: number;
  t: number;
}

export interface Attempt {
  /** The session it came from, by its id (two files can have the same name). */
  session: string;
  /** Where it is among the session's attempts, from 0: the same as its place among the replay's attempts. */
  order: number;
  levelId: number;
  level: string;
  /** Which try at this level in its session, from 1. */
  attempt: number;
  startTick: number;
  endTick: number;
  /** Simulation ticks (1/60 s) spent in the level; time paused or on the map does not count. */
  ticks: number;
  outcome: Outcome;
  /** Where and how Ben died, when he did. */
  death?: { cause: number; detail: number; x: number; y: number; tick: number };
  path: PathPoint[];
  pauses: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The attempts of a session, in order. An attempt starts at a level start and ends at the first of: the level
 * cleared, Ben dying (the game's died or game over event), another level starting (he left), or the end of
 * the log (`open`: the sample was cut short or stopped in the level). An attempt that ends without a clear or a
 * death ends at the last place Ben was recorded, since the log has no event for walking back to the map.
 */
export function attemptsOf(session: Session): Attempt[] {
  const out: Attempt[] = [];
  let cur: Attempt | null = null;

  const finish = (outcome: Outcome, tick: number | null): void => {
    if (!cur) return;
    const last = cur.path[cur.path.length - 1];
    cur.outcome = outcome;
    cur.endTick = tick ?? last?.t ?? cur.startTick;
    cur.ticks = Math.max(0, cur.endTick - cur.startTick);
    out.push(cur);
    cur = null;
  };

  for (const e of session.events) {
    if (e.e === 'level') {
      finish('left', null);
      cur = {
        session: session.id,
        order: out.length,
        levelId: num(e['id']),
        level: typeof e['name'] === 'string' && e['name'] ? e['name'] : `Level ${num(e['id'])}`,
        attempt: num(e['attempt']) || 1,
        startTick: e.t,
        endTick: e.t,
        ticks: 0,
        outcome: 'open',
        path: [],
        pauses: 0,
      };
    } else if (!cur) {
      continue;
    } else if (e.e === 'pos') {
      cur.path.push({ x: num(e['x']), y: num(e['y']), t: e.t });
    } else if (e.e === 'death') {
      cur.death = {
        cause: num(e['cause']),
        detail: num(e['detail']),
        x: num(e['x']),
        y: num(e['y']),
        tick: e.t,
      };
    } else if (e.e === 'screen' && e['to'] === 'pause') {
      cur.pauses += 1;
    } else if (e.e === 'screen' && e['to'] === 'title') {
      finish('left', null);
    } else if (e.e === 'ev' && e['k'] === 'level_complete') {
      finish('clear', e.t);
    } else if (e.e === 'ev' && (e['k'] === 'died' || e['k'] === 'game_over')) {
      finish('died', e.t);
    }
  }
  finish('open', null);
  return out;
}

/** A place Ben stayed for a while: where, and for how many ticks. */
export interface Dwell {
  x: number;
  y: number;
  ticks: number;
}

/**
 * The places an attempt stayed put: a run of path points all within `radius` tiles of the first, lasting at
 * least `minTicks`. A long dwell is a player stuck, hesitating, or reading the room.
 */
export function dwells(attempt: Attempt, radius = 0.6, minTicks = 90): Dwell[] {
  const out: Dwell[] = [];
  const path = attempt.path;
  let from = 0;
  const close = (end: number): void => {
    const first = path[from];
    const last = path[end];
    if (first && last && last.t - first.t >= minTicks)
      out.push({ x: first.x, y: first.y, ticks: last.t - first.t });
  };
  for (let i = 1; i < path.length; i += 1) {
    const a = path[from]!;
    const p = path[i]!;
    if (Math.hypot(p.x - a.x, p.y - a.y) > radius) {
      close(i - 1);
      from = i;
    }
  }
  close(path.length - 1);
  return out;
}
