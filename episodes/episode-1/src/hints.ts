// Keycap and button hints that match the player's last-used device and keyboard layout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { InputDevice } from '@lieutenant-fizz/engine/input';

/** What the hints need to know: the device in use, and Options › Controls (0 Keen-style, 1 Modern). */
export interface HintContext {
  device: InputDevice;
  layout: number;
}

/** The screens that show a hint bar. */
export type HintScreen = 'list' | 'pause' | 'options' | 'saves' | 'controls';

const pad = (c: HintContext): boolean => c.device === 'gamepad';
const touch = (c: HintContext): boolean => c.device === 'touch';

/**
 * What the on-screen controls are called outside play, on their faces and in the hints: Jump chooses
 * and Pogo goes back, as A and B do on a gamepad.
 */
export const TOUCH_LABELS = {
  dpad: 'D-pad',
  select: 'Select',
  back: 'Back',
  pause: 'Pause',
} as const;

/** An on-screen control's name as a hint token (drawn as a keycap, like a key's name). */
const touchCap = (name: string): string => `{[${name}]}`;

/** The jump control: Ctrl in the Keen-style layout, Z in the modern one, A on a gamepad, Select on touch. */
export const jumpHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.select) : pad(c) ? '{A}' : c.layout === 1 ? '{[Z]}' : '{Ctrl}';

/** The confirm control. */
export const selectHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.select) : pad(c) ? '{A}' : '{Enter}';

/** The back control. */
export const backHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.back) : pad(c) ? '{B}' : '{Esc}';

/** The menu control that skips or resumes: Esc, Start on a gamepad, the Pause button on touch. */
export const menuHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.pause) : pad(c) ? '{Start}' : '{Esc}';

/**
 * The touch hints: the controls' own names, which read the same as their faces, and no keys. Where
 * the name says what the control does (Select, Back) it stands alone.
 */
function touchMenuHints(screen: HintScreen): string[] {
  const choose = `${touchCap(TOUCH_LABELS.dpad)} Choose`;
  const select = touchCap(TOUCH_LABELS.select);
  const back = touchCap(TOUCH_LABELS.back);
  switch (screen) {
    case 'options':
      return [`${touchCap(TOUCH_LABELS.dpad)} Choose and change`, back];
    case 'saves':
      return [choose, select, back];
    case 'controls':
      return [back];
    case 'pause':
      return [choose, select, `${touchCap(TOUCH_LABELS.pause)} Resume`];
    default:
      return [choose, select];
  }
}

/** The hints along the bottom of a menu screen, one entry per hint. */
export function menuHints(screen: HintScreen, c: HintContext): string[] {
  if (touch(c)) return touchMenuHints(screen);
  const choose = '{[↑↓]} Choose';
  const select = `${selectHint(c)} Select`;
  switch (screen) {
    case 'options':
      return [choose, '{[←→]} Change', `${backHint(c)} Back`];
    case 'saves':
      return [choose, select, `${backHint(c)} Back`];
    case 'controls':
      return [`${selectHint(c)} Back`, `${backHint(c)} Back`];
    case 'pause':
      return [choose, select, `${menuHint(c)} Resume`];
    default:
      return [choose, select];
  }
}

/** The hints on the credits roll. `act` is what the jump control does right now (Speed up, Continue). */
export function creditsHints(c: HintContext, act: string): string[] {
  return [`${menuHint(c)} Skip credits`, `${jumpHint(c)} ${act}`];
}

/** The hints on the stinger. */
export function stingerHints(c: HintContext): string[] {
  return [`${menuHint(c)} Skip`, `${jumpHint(c)} Continue`];
}

/**
 * The Controls table column to highlight: 1 Keen-style, 2 Modern, 3 Gamepad. The gamepad column
 * wins while a pad is the device in use.
 */
export const controlsColumn = (c: HintContext): number => (pad(c) ? 3 : c.layout === 1 ? 2 : 1);
