// The Touch controls screen: its rows, the text on them, how a row steps, and the two-tap Reset.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  DEFAULT_TOUCH_SETTINGS,
  OPACITIES,
  SIZES,
  type TouchSettings,
} from '@lieutenant-fizz/engine/touch-settings';
import type { MenuItem } from './ui';

/** The rows of the Touch controls screen, in order. */
export type TouchRow = 'size' | 'opacity' | 'hand' | 'haptics' | 'move' | 'reset' | 'back';

/** What the device offers, which decides which rows exist. */
export interface TouchCaps {
  /** `navigator.vibrate` is a function; without it a Haptics row would do nothing. */
  haptics: boolean;
}

/** How long a first tap on Reset stays armed, in milliseconds. */
export const RESET_ARM_MS = 3000;

const SIZE_NAMES: Record<(typeof SIZES)[number], string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

/** The rows to show: Haptics only where the device can vibrate. */
export function touchRows(caps: TouchCaps): TouchRow[] {
  const rows: TouchRow[] = ['size', 'opacity', 'hand'];
  if (caps.haptics) rows.push('haptics');
  rows.push('move', 'reset', 'back');
  return rows;
}

/** The menu id of a row, which the game acts on. */
export const touchRowId = (row: TouchRow): string => `touch:${row}`;

/** The row a menu id names, or null when it is not a Touch controls row. */
export function touchRowOf(id: string | undefined): TouchRow | null {
  if (!id?.startsWith('touch:')) return null;
  const row = id.slice(6);
  return ['size', 'opacity', 'hand', 'haptics', 'move', 'reset', 'back'].includes(row)
    ? (row as TouchRow)
    : null;
}

/** The menu rows for these settings. `armed` is whether Reset has had its first tap. */
export function touchItems(s: TouchSettings, rows: TouchRow[], armed: boolean): MenuItem[] {
  const on = (v: boolean): string => (v ? 'On' : 'Off');
  return rows.map((row): MenuItem => {
    const id = touchRowId(row);
    switch (row) {
      case 'size':
        return { id, label: 'Size', kind: 'choice', value: SIZE_NAMES[s.size] };
      case 'opacity':
        return { id, label: 'Opacity', kind: 'choice', value: `${s.opacity}%` };
      case 'hand':
        return { id, label: 'Left-handed', kind: 'choice', value: on(s.leftHanded) };
      case 'haptics':
        return { id, label: 'Haptics', kind: 'choice', value: on(s.haptics) };
      case 'move':
        return {
          id,
          label: 'Move controls',
          ...(Object.keys(s.pos).length ? { value: 'Custom' } : {}),
        };
      case 'reset':
        return { id, label: 'Reset', ...(armed ? { value: 'Tap again' } : {}) };
      case 'back':
        return { id, label: 'Back' };
    }
  });
}

/** Whether a row changes with Left and Right (the others are chosen). */
export const isStepRow = (row: TouchRow | null): boolean =>
  row === 'size' || row === 'opacity' || row === 'hand' || row === 'haptics';

/**
 * One step on a row, `d` of -1 or +1. At the end of a list a step stops, and choosing the row (`wrap`)
 * goes round to the other end. A row that does not step returns the same settings.
 */
export function stepTouch(
  s: TouchSettings,
  row: TouchRow,
  d: number,
  wrap: boolean,
): TouchSettings {
  const through = <T>(list: readonly T[], at: number): T => {
    const n = list.length;
    const i = at + d;
    return list[wrap ? (i + n) % n : Math.min(n - 1, Math.max(0, i))] as T;
  };
  switch (row) {
    case 'size':
      return { ...s, size: through(SIZES, SIZES.indexOf(s.size)) };
    case 'opacity':
      return {
        ...s,
        opacity: through(OPACITIES, Math.max(0, OPACITIES.indexOf(s.opacity as never))),
      };
    case 'hand':
      return { ...s, leftHanded: !s.leftHanded };
    case 'haptics':
      return { ...s, haptics: !s.haptics };
    default:
      return s;
  }
}

/** Every setting back to its default, including the moved controls. */
export function resetTouch(): TouchSettings {
  return { ...DEFAULT_TOUCH_SETTINGS, pos: {} };
}

/** Whether a Reset armed at `at` (a time in milliseconds, or null) is still waiting for its second tap at `now`. */
export function resetArmed(at: number | null, now: number): boolean {
  return at !== null && now - at < RESET_ARM_MS;
}
