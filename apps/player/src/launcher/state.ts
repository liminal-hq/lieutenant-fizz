// The launcher's state machine: what is on screen, the debug unlock count and what a choice asks the page to do.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Where the debug menu page is, relative to the launcher. */
export const DEBUG_URL = 'debug.html';

/** Where Episode 1 starts, relative to the launcher. */
export const EPISODE_1_URL = 'episode-1/index.html';

/** How many times in a row Version is chosen to show the debug menu row. */
export const TAPS_TO_UNLOCK = 7;

/** The tap from which a toast says how many are left. */
export const TOAST_FROM_TAP = 3;

export type Screen = 'home' | 'about';

export type RowId = 'episode-1' | 'about' | 'version' | 'debug' | 'hide-debug' | 'back';

export interface LauncherState {
  readonly screen: Screen;
  /** Version choices in a row on this visit to About. Any other choice, or leaving About, starts the count again. */
  readonly taps: number;
  /** The debug menu row is showing: it was unlocked now or on an earlier run. */
  readonly unlocked: boolean;
}

export type Action = { type: 'activate'; row: RowId } | { type: 'back' };

/** What the page should do: the reducer only says, so it stays free of the page, the store and the toasts. */
export type Effect =
  | { kind: 'toast'; message: string; replace?: boolean }
  | { kind: 'navigate'; url: string }
  | { kind: 'save-unlock'; unlocked: boolean };

export interface Row {
  readonly id: RowId;
  readonly label: string;
}

export function initialState(unlocked: boolean): LauncherState {
  return { screen: 'home', taps: 0, unlocked };
}

/** The rows on the screen now, top to bottom. */
export function rowsOf(state: LauncherState): readonly Row[] {
  if (state.screen === 'home') {
    return [
      { id: 'episode-1', label: 'Episode 1' },
      { id: 'about', label: 'About' },
    ];
  }
  const rows: Row[] = [{ id: 'version', label: 'Version' }];
  if (state.unlocked) {
    rows.push({ id: 'debug', label: 'Debug menu' }, { id: 'hide-debug', label: 'Hide debug menu' });
  }
  rows.push({ id: 'back', label: 'Back' });
  return rows;
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

/**
 * One step. The one place that navigates to the debug menu is the `debug` row below, so a test can show
 * nothing else reaches it.
 */
export function reduce(state: LauncherState, action: Action): Step {
  if (action.type === 'back') {
    return state.screen === 'about'
      ? { state: { ...state, screen: 'home', taps: 0 }, effects: [] }
      : unchanged(state);
  }
  // A row that is not on the screen does nothing (a late click after the screen changed).
  if (!rowsOf(state).some((r) => r.id === action.row)) return unchanged(state);
  switch (action.row) {
    case 'episode-1':
      return { state, effects: [{ kind: 'navigate', url: EPISODE_1_URL }] };
    case 'about':
      return { state: { ...state, screen: 'about', taps: 0 }, effects: [] };
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
  }
}
