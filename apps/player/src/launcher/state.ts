// The launcher's state machine: which stop and screen are showing, the debug unlock count, and what a choice asks the page to do.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Launch, LaunchSlot } from '@lieutenant-fizz/engine/launch';
import { NO_SAVES, formatSaved, slotLabel, type SaveSummary, type Stop } from './catalog';

/** Where the debug menu page is, relative to the launcher. */
export const DEBUG_URL = 'debug.html';

/** How many times in a row Version is chosen to show the debug menu row. */
export const TAPS_TO_UNLOCK = 7;

/** The tap from which a toast says how many are left. */
export const TOAST_FROM_TAP = 3;

export type Screen = 'home' | 'load' | 'about';

/** A row of the menu. `slot:` rows are the saves on the Load game screen. */
export type RowId =
  | 'continue'
  | 'new'
  | 'load'
  | 'options'
  | 'soon'
  | 'about'
  | 'quit'
  | 'version'
  | 'debug'
  | 'hide-debug'
  | 'back'
  | `slot:${LaunchSlot}`;

export interface LauncherState {
  readonly stops: readonly Stop[];
  /** The stop showing: an index into `stops`. */
  readonly stop: number;
  readonly screen: Screen;
  /** Version choices in a row on this visit to About. Any other choice, or leaving About, starts the count again. */
  readonly taps: number;
  /** The debug menu row is showing: it was unlocked now or on an earlier run. */
  readonly unlocked: boolean;
  /** The saves each episode has, by episode id. */
  readonly saves: Readonly<Record<string, SaveSummary>>;
  /** The app can close itself (the desktop app): App settings has a Quit row. */
  readonly canQuit: boolean;
}

export type Action =
  | { type: 'activate'; row: RowId }
  | { type: 'back' }
  /** Step to the next (1) or previous (-1) stop. */
  | { type: 'stop'; dir: -1 | 1 };

/** What the page should do: the reducer only says, so it stays free of the page, the store and the toasts. */
export type Effect =
  | { kind: 'toast'; message: string; replace?: boolean }
  /** Go to a page of the app (the debug menu). */
  | { kind: 'navigate'; url: string }
  /** Start an episode as the launch says. */
  | { kind: 'launch'; episode: string; launch: Launch }
  | { kind: 'save-unlock'; unlocked: boolean }
  /** Close the app (after the store is written out). */
  | { kind: 'quit' };

export interface Row {
  readonly id: RowId;
  readonly label: string;
  /** Shown at the row's right edge. */
  readonly value?: string;
  readonly disabled?: boolean;
}

export function initialState(
  stops: readonly Stop[],
  unlocked: boolean,
  saves: Readonly<Record<string, SaveSummary>> = {},
  caps: { canQuit?: boolean; stop?: number } = {},
): LauncherState {
  const stop =
    caps.stop !== undefined && caps.stop >= 0 && caps.stop < stops.length ? caps.stop : 0;
  return {
    stops,
    stop,
    screen: 'home',
    taps: 0,
    unlocked,
    saves,
    canQuit: caps.canQuit ?? false,
  };
}

/** The stop showing. */
export function currentStop(state: LauncherState): Stop {
  return state.stops[state.stop] ?? { kind: 'app' };
}

/** The saves of the episode on show (none for App settings). */
export function currentSaves(state: LauncherState): SaveSummary {
  const stop = currentStop(state);
  return stop.kind === 'episode' ? (state.saves[stop.id] ?? NO_SAVES) : NO_SAVES;
}

/** The rows on the screen now, top to bottom. */
export function rowsOf(state: LauncherState): readonly Row[] {
  const stop = currentStop(state);
  const saves = currentSaves(state);
  if (state.screen === 'home') {
    if (stop.kind === 'app') {
      return [
        { id: 'about', label: 'About' },
        ...(state.canQuit ? [{ id: 'quit' as const, label: 'Quit' }] : []),
      ];
    }
    if (!stop.playable) return [{ id: 'soon', label: 'Coming soon', disabled: true }];
    const rows: Row[] = [];
    if (saves.newest !== undefined) {
      rows.push({ id: 'continue', label: 'Continue', value: slotLabel(saves.newest) });
    }
    rows.push({ id: 'new', label: 'New game' });
    if (saves.entries.length > 0) rows.push({ id: 'load', label: 'Load game' });
    rows.push({ id: 'options', label: 'Options' });
    return rows;
  }
  if (state.screen === 'load') {
    return [
      ...saves.entries.map((e): Row => ({
        id: `slot:${e.slot}`,
        label: slotLabel(e.slot),
        value: formatSaved(e.at),
      })),
      { id: 'back', label: 'Back' },
    ];
  }
  const rows: Row[] = [{ id: 'version', label: 'Version' }];
  if (state.unlocked) {
    rows.push({ id: 'debug', label: 'Debug menu' }, { id: 'hide-debug', label: 'Hide debug menu' });
  }
  rows.push({ id: 'back', label: 'Back' });
  return rows;
}

/** Whether Back has somewhere to go on the screen now: everything but the home screen. */
export function hasBack(state: LauncherState): boolean {
  return state.screen !== 'home';
}

export interface Step {
  readonly state: LauncherState;
  readonly effects: readonly Effect[];
}

const unchanged = (state: LauncherState): Step => ({ state, effects: [] });

/** What the toast says when Version has been chosen `taps` times in a row. */
function remaining(taps: number): string {
  const left = TAPS_TO_UNLOCK - taps;
  return `${left} more ${left === 1 ? 'tap' : 'taps'} to show the debug menu`;
}

/** The slot a `slot:` row stands for. */
function slotOf(row: RowId): LaunchSlot | undefined {
  if (!row.startsWith('slot:')) return undefined;
  const slot = row.slice(5);
  return slot === 'auto' ? 'auto' : (Number(slot) as LaunchSlot);
}

/**
 * One step. The one place that navigates to the debug menu is the `debug` row below, so a test can show
 * nothing else reaches it.
 */
export function reduce(state: LauncherState, action: Action): Step {
  if (action.type === 'back') {
    return state.screen !== 'home'
      ? { state: { ...state, screen: 'home', taps: 0 }, effects: [] }
      : unchanged(state);
  }
  if (action.type === 'stop') {
    const next = state.stop + action.dir;
    // The carousel does not wrap, and only the home screen has stops to step through.
    if (state.screen !== 'home' || next < 0 || next >= state.stops.length) return unchanged(state);
    return { state: { ...state, stop: next, taps: 0 }, effects: [] };
  }
  const row = action.row;
  const available = rowsOf(state).find((r) => r.id === row);
  // A row that is not on the screen, or is dimmed, does nothing (a late click after the screen changed).
  if (!available || available.disabled) return unchanged(state);
  const stop = currentStop(state);
  const episode = stop.kind === 'episode' ? stop.id : undefined;
  const slot = slotOf(row);
  if (slot !== undefined && episode) {
    return { state, effects: [{ kind: 'launch', episode, launch: { kind: 'load', slot } }] };
  }
  switch (row) {
    case 'continue':
      return episode
        ? { state, effects: [{ kind: 'launch', episode, launch: { kind: 'continue' } }] }
        : unchanged(state);
    case 'new':
      return episode
        ? { state, effects: [{ kind: 'launch', episode, launch: { kind: 'new' } }] }
        : unchanged(state);
    case 'options':
      return episode
        ? { state, effects: [{ kind: 'launch', episode, launch: { kind: 'options' } }] }
        : unchanged(state);
    case 'load':
      return { state: { ...state, screen: 'load', taps: 0 }, effects: [] };
    case 'about':
      return { state: { ...state, screen: 'about', taps: 0 }, effects: [] };
    case 'quit':
      return { state, effects: [{ kind: 'quit' }] };
    case 'back':
      return { state: { ...state, screen: 'home', taps: 0 }, effects: [] };
    case 'debug':
      return { state, effects: [{ kind: 'navigate', url: DEBUG_URL }] };
    case 'hide-debug':
      return {
        state: { ...state, unlocked: false, taps: 0 },
        effects: [
          { kind: 'save-unlock', unlocked: false },
          { kind: 'toast', message: 'Debug menu hidden' },
        ],
      };
    case 'version': {
      if (state.unlocked) {
        return {
          state,
          effects: [{ kind: 'toast', message: 'The debug menu is already showing' }],
        };
      }
      const taps = state.taps + 1;
      if (taps >= TAPS_TO_UNLOCK) {
        return {
          state: { ...state, taps: 0, unlocked: true },
          effects: [
            { kind: 'save-unlock', unlocked: true },
            { kind: 'toast', message: 'Debug menu is showing' },
          ],
        };
      }
      return {
        state: { ...state, taps },
        effects: taps >= TOAST_FROM_TAP ? [{ kind: 'toast', message: remaining(taps) }] : [],
      };
    }
    default:
      return unchanged(state);
  }
}
