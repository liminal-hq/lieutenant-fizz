// The launcher's state machine: which stop and screen are showing, the debug unlock count, and what a choice asks the page to do.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Launch, LaunchSlot } from '@lieutenant-fizz/engine/launch';
import {
  DEFAULT_GLOBAL_OPTIONS,
  stepGlobalOption,
  type GlobalOptions,
} from '@lieutenant-fizz/engine/options';
import { NO_SAVES, formatSaved, slotLabel, type SaveSummary, type Stop } from './catalog';

/** Where the debug menu page is, relative to the launcher. */
export const DEBUG_URL = 'debug.html';

/** How many times in a row Version is chosen to show the debug menu row. */
export const TAPS_TO_UNLOCK = 7;

/** The tap from which a toast says how many are left. */
export const TOAST_FROM_TAP = 3;

import {
  SETTINGS_TABS,
  TAB_NAMES,
  settingOf,
  settingRow,
  tabKeys,
  withDefaults,
  type SettingKey,
  type SettingsTab,
} from './settings';

export type Screen = 'home' | 'load' | 'about' | 'settings' | 'saves';

/** A row of the menu. `slot:` rows are the saves on the Load game screen. */
export type RowId =
  | 'continue'
  | 'new'
  | 'load'
  | 'options'
  | 'soon'
  | 'about'
  | 'settings'
  | 'saves'
  | 'export'
  | 'import'
  | 'tab'
  | 'reset'
  | 'quit'
  | 'version'
  | 'debug'
  | 'hide-debug'
  | 'back'
  | `opt:${SettingKey}`
  | `info:${string}`
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
  /** The device has a touch screen: Settings has a Row spacing row. */
  readonly touch: boolean;
  /** The app-wide options the Settings screen shows and changes. */
  readonly options: GlobalOptions;
  /** The tab showing on the Settings screen. */
  readonly tab: SettingsTab;
  /** Reset has been tapped once and waits for its second tap. */
  readonly armed: boolean;
}

export type Action =
  | { type: 'activate'; row: RowId }
  | { type: 'back' }
  /** Change a Settings row by one step: right (1) or left (-1). */
  | { type: 'step'; row: RowId; dir: -1 | 1 }
  /** Jump to a tab by tapping its name on the strip. */
  | { type: 'pick-tab'; tab: SettingsTab }
  /** The options held are these (a save failed, so the screen goes back to them). */
  | { type: 'options'; options: GlobalOptions }
  /** The saves held changed (an import): the new summaries, by episode id. */
  | { type: 'saves'; saves: Readonly<Record<string, SaveSummary>> }
  /** The first tap on Reset timed out. */
  | { type: 'disarm' }
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
  | { kind: 'quit' }
  /** Save one app-wide option. */
  | { kind: 'save-option'; key: SettingKey; value: number | boolean }
  /** Put these app-wide options back to their defaults in the options file. */
  | { kind: 'reset-options'; keys: readonly SettingKey[] }
  /** Start the clock that disarms Reset. */
  | { kind: 'arm' }
  /** Save every episode's saves to a file the player chooses. */
  | { kind: 'export-saves' }
  /** Merge a saves file the player chooses into the saves held. */
  | { kind: 'import-saves' };

export interface Row {
  readonly id: RowId;
  readonly label: string;
  /** Shown at the row's right edge. */
  readonly value?: string;
  readonly disabled?: boolean;
  /** A Settings row drawn as a meter or as a choice with arrows. */
  readonly kind?: 'meter' | 'choice';
  /** Lit blocks of a meter, 0 to 8. */
  readonly meter?: number;
  /** A strip of names with one lit, drawn as a heading rather than a row. */
  readonly tabs?: { readonly names: readonly string[]; readonly active: number };
}

export function initialState(
  stops: readonly Stop[],
  unlocked: boolean,
  saves: Readonly<Record<string, SaveSummary>> = {},
  caps: {
    canQuit?: boolean;
    stop?: number;
    options?: GlobalOptions;
    touch?: boolean;
    /** Open About, when the debug menu was left for it from there. Only App settings has one. */
    about?: boolean;
  } = {},
): LauncherState {
  const stop =
    caps.stop !== undefined && caps.stop >= 0 && caps.stop < stops.length ? caps.stop : 0;
  return {
    stops,
    stop,
    screen: caps.about && stops[stop]?.kind === 'app' ? 'about' : 'home',
    taps: 0,
    unlocked,
    saves,
    canQuit: caps.canQuit ?? false,
    touch: caps.touch ?? false,
    options: caps.options ?? DEFAULT_GLOBAL_OPTIONS,
    tab: 'sound',
    armed: false,
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
        { id: 'settings', label: 'Settings' },
        { id: 'saves', label: 'Saves' },
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
  if (state.screen === 'saves') {
    const total = totalSaves(state);
    return [
      {
        id: 'export',
        label: 'Export all saves',
        value: total > 0 ? countLabel(total) : 'No saves',
        disabled: total === 0,
      },
      { id: 'import', label: 'Import saves' },
      ...state.stops.flatMap((s): Row[] =>
        s.kind === 'episode' && s.playable
          ? [
              {
                id: `info:${s.id}`,
                label: `Episode ${s.number}`,
                value: countLabel(state.saves[s.id]?.entries.length ?? 0),
                disabled: true,
              },
            ]
          : [],
      ),
      { id: 'back', label: 'Back' },
    ];
  }
  if (state.screen === 'settings') {
    const o = state.options;
    return [
      {
        id: 'tab',
        label: 'Section',
        tabs: {
          names: SETTINGS_TABS.map((t) => TAB_NAMES[t]),
          active: SETTINGS_TABS.indexOf(state.tab),
        },
      },
      ...tabKeys(state.tab, { desktop: state.canQuit, touch: state.touch }).map((key): Row => {
        const r = settingRow(key, o);
        return {
          id: `opt:${key}`,
          label: r.label,
          kind: r.kind,
          ...(r.value !== undefined ? { value: r.value } : {}),
          ...(r.meter !== undefined ? { meter: r.meter } : {}),
        };
      }),
      { id: 'reset', label: 'Reset', ...(state.armed ? { value: 'Tap again' } : {}) },
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

/** How many saves are held across every episode. */
export const totalSaves = (state: LauncherState): number =>
  Object.values(state.saves).reduce((n, s) => n + s.entries.length, 0);

/** `3 saves`, `1 save` or `No saves`. */
const countLabel = (n: number): string =>
  n === 0 ? 'No saves' : `${n} ${n === 1 ? 'save' : 'saves'}`;

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
function reduceScreen(state: LauncherState, action: Action): Step {
  if (action.type === 'disarm') return unchanged(state);
  if (action.type === 'options')
    return { state: { ...state, options: action.options }, effects: [] };
  if (action.type === 'saves') return { state: { ...state, saves: action.saves }, effects: [] };
  if (action.type === 'pick-tab') {
    return state.screen === 'settings' && action.tab !== state.tab
      ? { state: { ...state, tab: action.tab }, effects: [] }
      : unchanged(state);
  }
  if (action.type === 'step') return stepRow(state, action.row, action.dir, false);
  if (action.type === 'back') {
    return state.screen !== 'home'
      ? { state: { ...state, screen: 'home', taps: 0 }, effects: [] }
      : unchanged(state);
  }
  if (action.type === 'stop') {
    const n = state.stops.length;
    // The carousel loops past either end, and only the home screen has stops to step through.
    if (state.screen !== 'home' || n < 2) return unchanged(state);
    const next = (state.stop + action.dir + n) % n;
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
    case 'settings':
      return { state: { ...state, screen: 'settings', taps: 0, tab: 'sound' }, effects: [] };
    case 'saves':
      return { state: { ...state, screen: 'saves', taps: 0 }, effects: [] };
    case 'export':
      return { state, effects: [{ kind: 'export-saves' }] };
    case 'import':
      return { state, effects: [{ kind: 'import-saves' }] };
    case 'tab':
    case 'reset':
      return state.screen === 'settings' ? settingsRow(state, row) : unchanged(state);
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
      return settingOf(row) ? stepRow(state, row, 1, true) : unchanged(state);
  }
}

/** Changes a Settings row: the Section row switches tab, a setting steps (a tap wraps, an arrow clamps a meter). */
function stepRow(state: LauncherState, row: RowId, dir: -1 | 1, wrap: boolean): Step {
  if (state.screen !== 'settings') return unchanged(state);
  if (row === 'tab') {
    const at = SETTINGS_TABS.indexOf(state.tab);
    const tab = SETTINGS_TABS[(at + dir + SETTINGS_TABS.length) % SETTINGS_TABS.length] ?? 'sound';
    return { state: { ...state, tab }, effects: [] };
  }
  const key = settingOf(row);
  const shown = tabKeys(state.tab, { desktop: state.canQuit, touch: state.touch });
  if (!key || !shown.includes(key)) return unchanged(state);
  const options = stepGlobalOption(state.options, key, dir, wrap);
  const value = options[key];
  if (value === state.options[key]) return unchanged(state);
  return { state: { ...state, options }, effects: [{ kind: 'save-option', key, value }] };
}

/** The Section row (a tap goes to the next tab) and the two-tap Reset of the tab's settings. */
function settingsRow(state: LauncherState, row: RowId): Step {
  if (row === 'tab') return stepRow(state, row, 1, true);
  const keys = tabKeys(state.tab, { desktop: state.canQuit, touch: state.touch });
  if (!state.armed) return { state: { ...state, armed: true }, effects: [{ kind: 'arm' }] };
  return {
    state: { ...state, armed: false, options: withDefaults(state.options, keys) },
    effects: [{ kind: 'reset-options', keys }],
  };
}

/** One step. Anything but the second tap on Reset disarms it. */
export function reduce(state: LauncherState, action: Action): Step {
  if (action.type === 'disarm') {
    return state.armed ? { state: { ...state, armed: false }, effects: [] } : unchanged(state);
  }
  const out = reduceScreen(state, action);
  const resetting = action.type === 'activate' && action.row === 'reset';
  if (state.armed && !resetting) return { ...out, state: { ...out.state, armed: false } };
  return out;
}
