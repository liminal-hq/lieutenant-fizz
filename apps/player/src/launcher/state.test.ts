// Tests for the launcher's state machine.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEBUG_URL,
  EPISODE_1_URL,
  TAPS_TO_UNLOCK,
  initialState,
  reduce,
  rowsOf,
  type Action,
  type Effect,
  type LauncherState,
  type RowId,
} from './state';

const press = (state: LauncherState, row: RowId) => reduce(state, { type: 'activate', row });

/** Runs the actions in order and keeps every effect they asked for. */
function run(state: LauncherState, actions: readonly Action[]) {
  const effects: Effect[] = [];
  for (const action of actions) {
    const step = reduce(state, action);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

const toAbout = (state = initialState(false)) => press(state, 'about').state;
const taps = (n: number): Action[] =>
  Array.from({ length: n }, () => ({ type: 'activate', row: 'version' }));

describe('the launcher screens', () => {
  it('opens on the home screen with Episode 1 and About', () => {
    expect(rowsOf(initialState(false)).map((r) => r.id)).toEqual(['episode-1', 'about']);
  });

  it('opens About and goes back to the home screen', () => {
    const about = toAbout();
    expect(about.screen).toBe('about');
    expect(rowsOf(about).map((r) => r.id)).toEqual(['version', 'back']);
    expect(reduce(about, { type: 'back' }).state.screen).toBe('home');
    expect(press(about, 'back').state.screen).toBe('home');
  });

  it('leaves the home screen alone on back, and ignores a row that is not showing', () => {
    const home = initialState(false);
    expect(reduce(home, { type: 'back' })).toEqual({ state: home, effects: [] });
    expect(press(home, 'version')).toEqual({ state: home, effects: [] });
    expect(press(toAbout(), 'episode-1').effects).toEqual([]);
  });

  it('starts Episode 1 by navigating to its page', () => {
    expect(press(initialState(false), 'episode-1').effects).toEqual([
      { kind: 'navigate', url: EPISODE_1_URL },
    ]);
  });
});

describe('the debug menu unlock', () => {
  it('shows the debug rows only after seven Version choices in a row', () => {
    const six = run(toAbout(), taps(TAPS_TO_UNLOCK - 1));
    expect(six.state.unlocked).toBe(false);
    expect(rowsOf(six.state).map((r) => r.id)).not.toContain('debug');
    const seven = reduce(six.state, { type: 'activate', row: 'version' });
    expect(seven.state.unlocked).toBe(true);
    expect(rowsOf(seven.state).map((r) => r.id)).toEqual([
      'version',
      'debug',
      'hide-debug',
      'back',
    ]);
    expect(seven.effects).toContainEqual({ kind: 'save-unlock', unlocked: true });
  });

  it('toasts from the third tap with how many are left, and says "tap" for the last one', () => {
    const { effects } = run(toAbout(), taps(6));
    expect(effects).toEqual([
      { kind: 'toast', message: '4 more taps to show the debug menu' },
      { kind: 'toast', message: '3 more taps to show the debug menu' },
      { kind: 'toast', message: '2 more taps to show the debug menu' },
      { kind: 'toast', message: '1 more tap to show the debug menu' },
    ]);
  });

  it('starts the count again when another row is chosen or About is left', () => {
    const again = run(toAbout(), [
      ...taps(5),
      { type: 'back' },
      { type: 'activate', row: 'about' },
      ...taps(5),
    ]);
    expect(again.state.unlocked).toBe(false);
    const leftAlone = run(toAbout(), [
      ...taps(6),
      { type: 'back' },
      { type: 'activate', row: 'about' },
      ...taps(1),
    ]);
    expect(leftAlone.state.unlocked).toBe(false);
    expect(leftAlone.state.taps).toBe(1);
  });

  it('does not count again once it is showing', () => {
    const step = press(toAbout(initialState(true)), 'version');
    expect(step.state.unlocked).toBe(true);
    expect(step.effects).toEqual([{ kind: 'toast', message: 'The debug menu is already showing' }]);
  });

  it('hides the rows again and saves that', () => {
    const step = press(toAbout(initialState(true)), 'hide-debug');
    expect(step.state.unlocked).toBe(false);
    expect(step.effects).toContainEqual({ kind: 'save-unlock', unlocked: false });
    expect(rowsOf(step.state).map((r) => r.id)).toEqual(['version', 'back']);
  });

  it('goes to the debug menu only from its row, and nothing else navigates there', () => {
    const unlocked = toAbout(initialState(true));
    expect(press(unlocked, 'debug').effects).toEqual([{ kind: 'navigate', url: DEBUG_URL }]);
    const rows: RowId[] = ['episode-1', 'about', 'version', 'hide-debug', 'back'];
    for (const state of [initialState(false), initialState(true), unlocked, toAbout()]) {
      for (const row of rows) {
        const urls = press(state, row).effects.filter((e) => e.kind === 'navigate');
        expect(urls.every((e) => e.url !== DEBUG_URL)).toBe(true);
      }
      expect(reduce(state, { type: 'back' }).effects).toEqual([]);
    }
  });

  it('shows the debug rows from the start when it was unlocked on an earlier run', () => {
    expect(rowsOf(toAbout(initialState(true))).map((r) => r.id)).toContain('debug');
  });
});
