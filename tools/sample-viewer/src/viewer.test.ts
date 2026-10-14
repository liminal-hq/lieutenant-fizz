// Tests for the sample viewer's combined numbers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { sessionOf } from '../../../episodes/episode-1/src/replay/session-test-util';
import { pressCounts, summarise } from './aggregate';

/** A level attempt's events, from a start to an end event. */
const play = (id: number, name: string, attempt: number, from: number, end: object[]): object[] => [
  { t: from, e: 'level', id, name, attempt },
  { t: from + 4, e: 'pos', x: 2, y: 3 },
  { t: from + 8, e: 'pos', x: 6, y: 3 },
  ...end,
];

describe('pressCounts', () => {
  it('counts a button each time its bit goes on, not while it is held', () => {
    const s = sessionOf('s', [
      { t: 0, e: 'in', b: 2 },
      { t: 1, e: 'in', b: 2 | 16 },
      { t: 2, e: 'in', b: 2 },
      { t: 3, e: 'in', b: 2 | 16 },
      { t: 4, e: 'in', b: 0 },
    ]);
    // Order: Left, Right, Up, Down, Jump, Pogo, Fizz.
    expect(pressCounts(s)).toEqual([0, 1, 0, 0, 2, 0, 0]);
  });
});

describe('summarise', () => {
  const a = sessionOf('a', [
    ...play(0, 'Crater Fields', 1, 0, [
      { t: 50, e: 'death', cause: 3, detail: 5, x: 30.2, y: 2.4 },
      { t: 60, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
    ...play(0, 'Crater Fields', 2, 100, [
      { t: 700, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
    ]),
    { t: 710, e: 'in', b: 16 },
  ]);
  const b = sessionOf('b', [
    ...play(0, 'Crater Fields', 1, 0, [
      { t: 80, e: 'death', cause: 5, detail: 0, x: 30.9, y: 2.9 },
      { t: 90, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
    ...play(1, 'Crystal Caves', 1, 200, [
      { t: 500, e: 'ev', k: 'level_complete', a: 1, b: 0, c: 0 },
    ]),
  ]);

  it('gives each level its attempts, clears, deaths, rate and medians', () => {
    const { levels, sessions } = summarise([a, b]);
    expect(sessions).toBe(2);
    expect(levels.map((l) => [l.name, l.plays, l.clears, l.deaths, l.clearRate])).toEqual([
      ['Crater Fields', 3, 1, 2, 1 / 3],
      ['Crystal Caves', 1, 1, 0, 1],
    ]);
    expect(levels[0]).toMatchObject({ medianClearTicks: 600, medianTicks: 90 });
  });

  it('counts lives lost by cause, with the enemy’s kind, and groups deaths by tile', () => {
    const { causes, spots } = summarise([a, b]);
    expect(causes).toEqual([
      { name: 'Chocolate', count: 1 },
      { name: 'An enemy (Gloop)', count: 1 },
    ]);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({ level: 'Crater Fields', x: 30, y: 2, count: 2 });
    // Each death behind a spot says where to find it: the session, the attempt in it and the tick.
    expect(spots[0]!.refs).toEqual([
      { session: 'a', order: 0, tick: 50 },
      { session: 'b', order: 0, tick: 80 },
    ]);
  });

  it('counts the buttons pressed across sessions', () => {
    expect(summarise([a, b]).buttons.find((x) => x.name === 'Jump')!.count).toBe(1);
  });

  it('copes with no sessions', () => {
    expect(summarise([])).toMatchObject({ sessions: 0, levels: [], causes: [], spots: [] });
  });
});
