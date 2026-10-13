// Combines the attempts and inputs of many sessions into the numbers the viewer shows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Session } from '@lieutenant-fizz/engine/session/log';
import { attemptsOf, type Attempt } from '../../../episodes/episode-1/src/replay/attempts';
import { causeText, INPUT_BITS } from '../../../episodes/episode-1/src/replay/names';

export interface LevelStat {
  id: number;
  name: string;
  /** Attempts at the level, from every session. */
  plays: number;
  clears: number;
  /** Lives lost in it (attempts that ended in a death). */
  deaths: number;
  /** Clears as a share of attempts, 0 to 1. */
  clearRate: number;
  /** Median ticks of an attempt that cleared the level, or null when none did. */
  medianClearTicks: number | null;
  /** Median ticks of any attempt. */
  medianTicks: number;
  pauses: number;
}

export interface Spot {
  levelId: number;
  level: string;
  /** The tile Ben died in. */
  x: number;
  y: number;
  count: number;
  /** The most common cause there. */
  cause: string;
}

export interface Summary {
  sessions: number;
  attempts: Attempt[];
  levels: LevelStat[];
  /** How often each button was pressed (a press is a bit going from off to on). */
  buttons: { name: string; count: number }[];
  /** Lives lost by cause, most first. */
  causes: { name: string; count: number }[];
  /** Where lives were lost, most first. */
  spots: Spot[];
}

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The number of presses of each button in a session, from the input word's bits going on. */
export function pressCounts(session: Session): number[] {
  const counts = INPUT_BITS.map(() => 0);
  let bits = 0;
  for (const e of session.events) {
    if (e.e !== 'in') continue;
    const now = typeof e['b'] === 'number' ? e['b'] : 0;
    INPUT_BITS.forEach(({ bit }, i) => {
      if (now & bit && !(bits & bit)) counts[i]! += 1;
    });
    bits = now;
  }
  return counts;
}

/** Everything the viewer shows, for the sessions loaded. */
export function summarise(sessions: readonly Session[]): Summary {
  const attempts = sessions.flatMap(attemptsOf);

  const byLevel = new Map<number, Attempt[]>();
  for (const a of attempts) {
    const list = byLevel.get(a.levelId) ?? [];
    list.push(a);
    byLevel.set(a.levelId, list);
  }
  const levels: LevelStat[] = [...byLevel.entries()]
    .map(([id, list]) => {
      const clears = list.filter((a) => a.outcome === 'clear');
      return {
        id,
        name: list[0]!.level,
        plays: list.length,
        clears: clears.length,
        deaths: list.filter((a) => a.outcome === 'died' || a.death).length,
        clearRate: list.length ? clears.length / list.length : 0,
        medianClearTicks: clears.length ? median(clears.map((a) => a.ticks)) : null,
        medianTicks: median(list.map((a) => a.ticks)),
        pauses: list.reduce((n, a) => n + a.pauses, 0),
      };
    })
    .sort((a, b) => a.id - b.id);

  const totals = INPUT_BITS.map(() => 0);
  for (const s of sessions) pressCounts(s).forEach((n, i) => (totals[i]! += n));
  const buttons = INPUT_BITS.map(({ name }, i) => ({ name, count: totals[i]! }));

  const causeCounts = new Map<string, number>();
  const spotMap = new Map<string, { spot: Spot; causes: Map<string, number> }>();
  for (const a of attempts) {
    if (!a.death) continue;
    const cause = causeText(a.death.cause, a.death.detail);
    causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    const x = Math.floor(a.death.x);
    const y = Math.floor(a.death.y);
    const key = `${a.levelId}:${x}:${y}`;
    const entry = spotMap.get(key) ?? {
      spot: { levelId: a.levelId, level: a.level, x, y, count: 0, cause },
      causes: new Map<string, number>(),
    };
    entry.spot.count += 1;
    entry.causes.set(cause, (entry.causes.get(cause) ?? 0) + 1);
    spotMap.set(key, entry);
  }
  const spots = [...spotMap.values()]
    .map(({ spot, causes }) => ({
      ...spot,
      cause: [...causes.entries()].sort((a, b) => b[1] - a[1])[0]![0],
    }))
    .sort((a, b) => b.count - a.count);

  return {
    sessions: sessions.length,
    attempts,
    levels,
    buttons,
    causes: [...causeCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    spots,
  };
}
