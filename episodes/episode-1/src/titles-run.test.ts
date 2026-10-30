// Tests for the opening titles' run: the gate, the skip's guard and fade, and when the idle title brings them back.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { TITLES_SECONDS } from './titles';
import {
  LEAVE_SECONDS,
  PRESS_GUARD_MS,
  TitlesRun,
  classicLoopSeconds,
  idleSeconds,
} from './titles-run';

describe('the gate', () => {
  it('holds the clock until the first press, then plays from the start', () => {
    const run = new TitlesRun('menu', true);
    expect(run.atGate).toBe(true);
    expect(run.playing).toBe(false);
    expect(run.advance(1)).toBe(false);
    expect(run.time).toBe(0);
    run.press(1000);
    expect(run.atGate).toBe(false);
    expect(run.playing).toBe(true);
    run.advance(0.05);
    expect(run.time).toBeCloseTo(0.05, 9);
  });

  it('starts playing at once with no gate, as a launcher’s New game does', () => {
    const run = new TitlesRun('new', false);
    expect(run.playing).toBe(true);
    expect(run.after).toBe('new');
  });

  it('does not let the key that opens the gate also skip the titles', () => {
    const run = new TitlesRun('menu', true);
    run.press(1000);
    run.press(1000 + PRESS_GUARD_MS - 1);
    expect(run.leaving).toBeNull();
    run.press(1000 + PRESS_GUARD_MS + 1);
    expect(run.leaving).toBe(0);
  });
});

describe('playing', () => {
  it('ends by itself after one pass', () => {
    const run = new TitlesRun('menu', false);
    let done = false;
    let steps = 0;
    while (!done && steps < 10_000) {
      done = run.advance(1 / 60);
      steps++;
    }
    expect(done).toBe(true);
    expect(run.time).toBeCloseTo(TITLES_SECONDS, 1);
    expect(steps).toBeGreaterThan(760);
    expect(steps).toBeLessThan(780);
  });

  it('takes no more than a tenth of a second in a step, so a stalled page does not skip ahead', () => {
    const run = new TitlesRun('menu', false);
    run.advance(30);
    expect(run.time).toBeCloseTo(0.1, 9);
    run.advance(-1);
    expect(run.time).toBeCloseTo(0.1, 9);
  });

  it('fades to black over a third of a second when skipped, and ends there', () => {
    const run = new TitlesRun('menu', false);
    run.advance(0.05);
    run.press(5000);
    expect(run.blackout).toBe(0);
    // The picture holds still while it fades.
    const t = run.time;
    let done = false;
    let steps = 0;
    let half = 0;
    while (!done) {
      done = run.advance(0.05);
      steps++;
      if (steps === 3) half = run.blackout;
    }
    expect(steps).toBe(Math.ceil(LEAVE_SECONDS / 0.05));
    expect(half).toBeCloseTo(0.15 / LEAVE_SECONDS, 9);
    expect(run.time).toBe(t);
    expect(run.blackout).toBe(1);
  });

  it('starts the skip only once', () => {
    const run = new TitlesRun('menu', false);
    run.press(5000);
    run.advance(0.1);
    run.press(9000);
    expect(run.leaving).toBeCloseTo(0.1, 9);
  });
});

describe('playing twice', () => {
  it('runs two passes in a row when asked, the picture starting over for the second', () => {
    const run = new TitlesRun('menu', false, 2);
    let steps = 0;
    let atSecondStart = -1;
    while (!run.advance(1 / 60) && steps < 5000) {
      steps++;
      if (atSecondStart < 0 && run.time >= TITLES_SECONDS) atSecondStart = run.moment;
    }
    expect(steps).toBeGreaterThan(1520);
    expect(steps).toBeLessThan(1560);
    expect(atSecondStart).toBeLessThan(0.1);
    expect(run.time).toBeCloseTo(TITLES_SECONDS * 2, 1);
  });

  it('plays one pass by default', () => {
    expect(new TitlesRun('menu', false).loops).toBe(1);
  });
});

describe('the idle title', () => {
  it('waits two passes of the title song as it plays, less the fade, so the cut follows a loop of the music', () => {
    expect(classicLoopSeconds(140)).toBeCloseTo(13.71, 2);
    expect(idleSeconds(classicLoopSeconds(140))).toBeCloseTo(2 * 13.714 - LEAVE_SECONDS, 2);
    expect(idleSeconds(30)).toBeCloseTo(60 - LEAVE_SECONDS, 9);
  });
});
