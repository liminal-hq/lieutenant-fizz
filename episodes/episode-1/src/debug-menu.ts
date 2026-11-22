// The hidden Debug menu on the title screen: the key sequence that opens it and the rows it lists.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { modeName } from './difficulty';
import type { LevelInfo } from './story';
import type { MenuItem } from './ui';

/**
 * The secret key sequence, as `KeyboardEvent.code`s. Each step lists the codes that count for it, so the main
 * row and the numeric keypad both work. Change the sequence here and nowhere else.
 */
export const DEBUG_SEQUENCE: readonly (readonly string[])[] = [
  ['Digit2', 'Numpad2'],
  ['Enter', 'NumpadEnter'],
];

/** The longest gap, in milliseconds, between one key of the sequence and the next. */
export const DEBUG_SEQUENCE_MS = 1500;

/** Watches key presses for a sequence. It holds no clock of its own: the caller says what time each press came. */
export interface SequenceMatcher {
  /** Feeds one key press at `now` (milliseconds); true when this press completes the sequence. */
  press(code: string, now: number): boolean;
  /** Forgets any progress. */
  reset(): void;
}

/**
 * A matcher for `steps`. A key that is not the next step drops the progress (and counts as a fresh start when
 * it is the first step); a step that comes more than `timeoutMs` after the one before starts over.
 */
export function createSequenceMatcher(
  steps: readonly (readonly string[])[],
  timeoutMs: number,
): SequenceMatcher {
  let at = 0;
  let last = 0;
  return {
    press(code, now) {
      if (at > 0 && now - last > timeoutMs) at = 0;
      if (steps[at]?.includes(code)) {
        at++;
        last = now;
        if (at === steps.length) {
          at = 0;
          return true;
        }
        return false;
      }
      // A wrong key starts over, and may itself be the first step.
      at = steps[0]?.includes(code) ? 1 : 0;
      last = now;
      return false;
    },
    reset() {
      at = 0;
    },
  };
}

/** What a Debug menu row does. The game maps each to its own code. */
export type DebugAction = 'warp' | 'inputTest' | 'mode';

/** One row of the Debug menu. Add a row here to add a debug tool. */
export interface DebugEntry {
  id: string;
  label: string;
  action: DebugAction;
}

/** The rows of the Debug menu, above Back. */
export const DEBUG_ENTRIES: readonly DebugEntry[] = [
  { id: 'debug:warp', label: 'Warp to level', action: 'warp' },
  { id: 'debug:inputTest', label: 'Input test', action: 'inputTest' },
  { id: 'debug:mode', label: 'Mode', action: 'mode' },
];

/** The id of Back on both Debug screens. */
export const DEBUG_BACK_ID = 'back';

/** The Debug menu: its entries, then Back. The Mode row shows the mode in use (`normal`) and flips it. */
export function debugItems(normal = false): MenuItem[] {
  return [
    ...DEBUG_ENTRIES.map((e): MenuItem => ({
      id: e.id,
      label: e.label,
      ...(e.action === 'mode' ? { value: modeName(normal) } : {}),
    })),
    { id: DEBUG_BACK_ID, label: 'Back' },
  ];
}

/** The action a Debug menu row id runs, or null when it is not an entry. */
export function debugActionOf(id: string | undefined): DebugAction | null {
  return DEBUG_ENTRIES.find((e) => e.id === id)?.action ?? null;
}

/** The menu id of the warp row for a level. */
export const warpRowId = (level: number): string => `warp:${level}`;

/** The level a warp row id names, or null when it is not one. */
export function warpLevelOf(id: string | undefined): number | null {
  if (!id?.startsWith('warp:')) return null;
  const n = Number(id.slice(5));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Every level by name with its number (from 1), in table order, then Back. */
export function warpItems(levels: readonly Pick<LevelInfo, 'name'>[]): MenuItem[] {
  return [
    ...levels.map((l, i): MenuItem => ({ id: warpRowId(i), label: l.name, value: `${i + 1}` })),
    { id: DEBUG_BACK_ID, label: 'Back' },
  ];
}
