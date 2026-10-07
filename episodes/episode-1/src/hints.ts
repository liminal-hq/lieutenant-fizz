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

/** The jump control: Ctrl in the Keen-style layout, Z in the modern one, A on a gamepad. */
export const jumpHint = (c: HintContext): string =>
  pad(c) ? '{A}' : c.layout === 1 ? '{[Z]}' : '{Ctrl}';

/** The confirm control. */
export const selectHint = (c: HintContext): string => (pad(c) ? '{A}' : '{Enter}');

/** The back control. */
export const backHint = (c: HintContext): string => (pad(c) ? '{B}' : '{Esc}');

/** The menu control that skips or resumes: Esc, or Start on a gamepad. */
export const menuHint = (c: HintContext): string => (pad(c) ? '{Start}' : '{Esc}');

/** The hints along the bottom of a menu screen, one entry per hint. */
export function menuHints(screen: HintScreen, c: HintContext): string[] {
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
