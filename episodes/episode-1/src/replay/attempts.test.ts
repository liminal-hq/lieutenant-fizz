// Tests for cutting a session into attempts at a level, and for finding where Ben stayed.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { attemptsOf, dwells, type Attempt } from './attempts';
import { sessionOf } from './session-test-util';

/** A level attempt's events, from a start to an end event. */
const play = (id: number, name: string, attempt: number, from: number, end: object[]): object[] => [
  { t: from, e: 'level', id, name, attempt },
  { t: from + 4, e: 'pos', x: 2, y: 3 },
  { t: from + 8, e: 'pos', x: 6, y: 3 },
  ...end,
];

describe('attemptsOf', () => {
  it('ends an attempt at a clear, at a death, at the next level and at the end of the log', () => {
    const s = sessionOf('s', [
      ...play(0, 'Crater Fields', 1, 100, [
        { t: 120, e: 'death', cause: 3, detail: 5, x: 6.4, y: 2.1 },
        { t: 200, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
      ]),
      ...play(0, 'Crater Fields', 2, 300, [
        { t: 900, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
      ]),
      ...play(1, 'Crystal Caves', 1, 1000, []),
      ...play(2, 'Mildred’s Citadel', 1, 1100, []),
    ]);
    const attempts = attemptsOf(s);
    expect(attempts.map((a) => [a.level, a.attempt, a.outcome])).toEqual([
      ['Crater Fields', 1, 'died'],
      ['Crater Fields', 2, 'clear'],
      ['Crystal Caves', 1, 'left'],
      ['Mildred’s Citadel', 1, 'open'],
    ]);
    expect(attempts[0]).toMatchObject({
      ticks: 100,
      death: { cause: 3, detail: 5, x: 6.4, y: 2.1, tick: 120 },
    });
    // Each attempt knows its place in the session, which is its place among the replay's attempts.
    expect(attempts.map((a) => a.order)).toEqual([0, 1, 2, 3]);
    expect(attempts[1]!.ticks).toBe(600);
    // Leaving or being cut short ends at the last place Ben was seen.
    expect(attempts[2]).toMatchObject({ endTick: 1008, ticks: 8 });
    expect(attempts[3]!.path).toHaveLength(2);
  });

  it('counts pauses, and treats going back to the title as leaving', () => {
    const s = sessionOf('s', [
      ...play(0, 'Crater Fields', 1, 0, [
        { t: 20, e: 'screen', to: 'pause' },
        { t: 30, e: 'screen', to: 'play' },
        { t: 40, e: 'screen', to: 'pause' },
        { t: 50, e: 'screen', to: 'title' },
      ]),
    ]);
    const [a] = attemptsOf(s);
    expect(a).toMatchObject({ pauses: 2, outcome: 'left' });
  });

  it('ignores events before the first level', () => {
    expect(
      attemptsOf(
        sessionOf('s', [
          { t: 0, e: 'pos', x: 1, y: 1 },
          { t: 1, e: 'screen', to: 'title' },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('dwells', () => {
  const attempt = (path: [number, number, number][]): Attempt => ({
    session: 's',
    order: 0,
    levelId: 0,
    level: 'L',
    attempt: 1,
    startTick: 0,
    endTick: 0,
    ticks: 0,
    outcome: 'clear',
    path: path.map(([x, y, t]) => ({ x, y, t })),
    pauses: 0,
  });

  it('finds a place Ben stayed for at least a second and a half', () => {
    const got = dwells(
      attempt([
        [0, 0, 0],
        [4, 0, 4],
        [4.1, 0, 60],
        [4.2, 0.1, 120],
        [4.1, 0, 160],
        [9, 0, 164],
      ]),
    );
    expect(got).toEqual([{ x: 4, y: 0, ticks: 156 }]);
  });

  it('finds none when he keeps moving, and none for a short stop', () => {
    const moving = Array.from({ length: 50 }, (_, i): [number, number, number] => [i, 0, i * 4]);
    expect(dwells(attempt(moving))).toEqual([]);
    expect(
      dwells(
        attempt([
          [1, 1, 0],
          [1, 1, 40],
          [5, 5, 44],
        ]),
      ),
    ).toEqual([]);
    expect(dwells(attempt([]))).toEqual([]);
  });

  it('finds a dwell at the very end of a path', () => {
    expect(
      dwells(
        attempt([
          [0, 0, 0],
          [0.1, 0, 100],
        ]),
      ),
    ).toEqual([{ x: 0, y: 0, ticks: 100 }]);
  });
});
