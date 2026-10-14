// Tests for the launcher's state machine.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import { readSaves, stopsOf, type EpisodeInfo, type EpisodesFile } from './catalog';
import {
  DEBUG_URL,
  TAPS_TO_UNLOCK,
  currentStop,
  hasBack,
  initialState,
  reduce,
  rowsOf,
  type Action,
  type Effect,
  type LauncherState,
  type RowId,
} from './state';

const STOPS = stopsOf({
  episodes: [
    { id: 'episode-1', number: 1, title: 'The Cocoa Caper', status: 'playable' },
    { id: 'episode-2', number: 2, status: 'coming-soon' },
  ],
} satisfies EpisodesFile);

const info: EpisodeInfo = { page: 'p', saves: { auto: 'auto', slots: ['s1', 's2', 's3', 's4'] } };
const save = (at: number): string => JSON.stringify({ v: 3, at, progress: { lives: 3 } });
const withSaves = (data: Record<string, string>) => ({
  'episode-1': readSaves(memoryStorage(data), info),
});

const start = (unlocked = false, saves = {}): LauncherState => initialState(STOPS, unlocked, saves);
const press = (state: LauncherState, row: RowId) => reduce(state, { type: 'activate', row });
const ids = (state: LauncherState): string[] => rowsOf(state).map((r) => r.id);

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

const toApp = (state: LauncherState): LauncherState =>
  run(state, [
    { type: 'stop', dir: 1 },
    { type: 'stop', dir: 1 },
  ]).state;
const toAbout = (state: LauncherState = start()): LauncherState =>
  press(toApp(state), 'about').state;
const taps = (n: number): Action[] =>
  Array.from({ length: n }, () => ({ type: 'activate', row: 'version' }));

describe('the carousel', () => {
  it('opens on the first episode, with New game only until there is a save', () => {
    expect(currentStop(start())).toMatchObject({ id: 'episode-1' });
    expect(ids(start())).toEqual(['new']);
  });

  it('steps through the stops without wrapping, and says nothing at either end', () => {
    const one = start();
    expect(reduce(one, { type: 'stop', dir: -1 })).toEqual({ state: one, effects: [] });
    const two = reduce(one, { type: 'stop', dir: 1 }).state;
    expect(two.stop).toBe(1);
    const app = reduce(two, { type: 'stop', dir: 1 }).state;
    expect(currentStop(app).kind).toBe('app');
    expect(reduce(app, { type: 'stop', dir: 1 })).toEqual({ state: app, effects: [] });
    expect(reduce(app, { type: 'stop', dir: -1 }).state.stop).toBe(1);
  });

  it('shows a dimmed Coming soon on an episode that is not out, and App settings with About', () => {
    const soon = reduce(start(), { type: 'stop', dir: 1 }).state;
    expect(rowsOf(soon)).toEqual([{ id: 'soon', label: 'Coming soon', disabled: true }]);
    expect(press(soon, 'soon')).toEqual({ state: soon, effects: [] });
    expect(ids(toApp(start()))).toEqual(['about']);
  });

  it('does not change stop while a sub-screen is open', () => {
    const about = toAbout();
    expect(reduce(about, { type: 'stop', dir: -1 })).toEqual({ state: about, effects: [] });
  });
});

describe('an episode with saves', () => {
  const saves = withSaves({ auto: save(100), s2: save(300) });

  it('offers Continue with where it loads from, New game and Load game', () => {
    const rows = rowsOf(start(false, saves));
    expect(rows.map((r) => r.id)).toEqual(['continue', 'new', 'load']);
    expect(rows[0]).toMatchObject({ value: 'Slot 2' });
  });

  it('launches Continue, New game and a slot of the episode on show', () => {
    const state = start(false, saves);
    expect(press(state, 'continue').effects).toEqual([
      { kind: 'launch', episode: 'episode-1', launch: { kind: 'continue' } },
    ]);
    expect(press(state, 'new').effects).toEqual([
      { kind: 'launch', episode: 'episode-1', launch: { kind: 'new' } },
    ]);
    const load = press(state, 'load').state;
    expect(load.screen).toBe('load');
    expect(ids(load)).toEqual(['slot:auto', 'slot:2', 'back']);
    expect(press(load, 'slot:2').effects).toEqual([
      { kind: 'launch', episode: 'episode-1', launch: { kind: 'load', slot: 2 } },
    ]);
    expect(press(load, 'slot:auto').effects).toEqual([
      { kind: 'launch', episode: 'episode-1', launch: { kind: 'load', slot: 'auto' } },
    ]);
  });

  it('does nothing for Continue, or a slot, that is not on the screen', () => {
    const state = start();
    expect(press(state, 'continue')).toEqual({ state, effects: [] });
    expect(press(state, 'slot:3')).toEqual({ state, effects: [] });
  });

  it('goes back from the Load game screen to the home screen', () => {
    const load = press(start(false, saves), 'load').state;
    expect(hasBack(load)).toBe(true);
    expect(reduce(load, { type: 'back' }).state.screen).toBe('home');
    expect(press(load, 'back').state.screen).toBe('home');
  });
});

describe('Quit on the desktop', () => {
  const desktop = (): LauncherState => initialState(STOPS, false, {}, { canQuit: true });

  it('has a Quit row on App settings only where the app can close itself', () => {
    expect(ids(toApp(start()))).toEqual(['about']);
    expect(ids(toApp(desktop()))).toEqual(['about', 'quit']);
  });

  it('asks to close the app, and nothing else does', () => {
    expect(press(toApp(desktop()), 'quit').effects).toEqual([{ kind: 'quit' }]);
    // A press on a Quit row that is not there (no desktop, or another stop) does nothing.
    expect(press(toApp(start()), 'quit')).toEqual({ state: toApp(start()), effects: [] });
    expect(press(desktop(), 'quit').effects).toEqual([]);
  });
});

describe('the launcher screens', () => {
  it('opens About and goes back to the home screen', () => {
    const about = toAbout();
    expect(about.screen).toBe('about');
    expect(ids(about)).toEqual(['version', 'back']);
    expect(hasBack(about)).toBe(true);
    expect(reduce(about, { type: 'back' }).state.screen).toBe('home');
    expect(press(about, 'back').state.screen).toBe('home');
  });

  it('leaves the home screen alone on back, and ignores a row that is not showing', () => {
    const home = start();
    expect(hasBack(home)).toBe(false);
    expect(reduce(home, { type: 'back' })).toEqual({ state: home, effects: [] });
    expect(press(home, 'version')).toEqual({ state: home, effects: [] });
  });
});

describe('the debug menu unlock', () => {
  it('shows the debug rows only after seven Version choices in a row', () => {
    const six = run(toAbout(), taps(TAPS_TO_UNLOCK - 1));
    expect(six.state.unlocked).toBe(false);
    expect(ids(six.state)).not.toContain('debug');
    const seven = reduce(six.state, { type: 'activate', row: 'version' });
    expect(seven.state.unlocked).toBe(true);
    expect(ids(seven.state)).toEqual(['version', 'debug', 'hide-debug', 'back']);
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
    const about = toAbout();
    const again = run(about, [...taps(5), { type: 'back' }, { type: 'activate', row: 'about' }]);
    expect(again.state.taps).toBe(0);
    const left = run(about, [...taps(6), { type: 'back' }]);
    expect(left.state.taps).toBe(0);
  });

  it('does not count again once it is showing', () => {
    const step = press(toAbout(start(true)), 'version');
    expect(step.state.unlocked).toBe(true);
    expect(step.effects).toEqual([{ kind: 'toast', message: 'The debug menu is already showing' }]);
  });

  it('hides the rows again and saves that', () => {
    const step = press(toAbout(start(true)), 'hide-debug');
    expect(step.state.unlocked).toBe(false);
    expect(step.effects).toContainEqual({ kind: 'save-unlock', unlocked: false });
    expect(ids(step.state)).toEqual(['version', 'back']);
  });

  it('goes to the debug menu only from its row, and nothing else navigates there', () => {
    const unlocked = toAbout(start(true));
    expect(press(unlocked, 'debug').effects).toEqual([{ kind: 'navigate', url: DEBUG_URL }]);
    const rows: RowId[] = ['continue', 'new', 'load', 'about', 'version', 'hide-debug', 'back'];
    for (const state of [start(), start(true), unlocked, toAbout(), toApp(start())]) {
      for (const row of rows) {
        const urls = press(state, row).effects.filter((e) => e.kind === 'navigate');
        expect(urls.every((e) => e.url !== DEBUG_URL)).toBe(true);
      }
      expect(reduce(state, { type: 'back' }).effects).toEqual([]);
    }
  });

  it('shows the debug rows from the start when it was unlocked on an earlier run', () => {
    expect(ids(toAbout(start(true)))).toContain('debug');
  });
});
