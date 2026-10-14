// The hints along the bottom of the launcher for the device in use, written as the game writes its own.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { InputDevice } from '@lieutenant-fizz/engine/input';
import type { LauncherState } from './state';

/**
 * One entry per hint, in the form `hintText` turns into keycaps and button glyphs: `{[↑↓]}` is a keycap,
 * `{Enter}` a named key and `{A}` a gamepad button. A keyboard (and a mouse) gets key names, a gamepad its
 * buttons, and touch none: the on-screen controls say what they do.
 */
export function hintsOf(state: LauncherState, device: InputDevice = 'keyboard'): string[] {
  if (device === 'touch') return [];
  if (device === 'gamepad') {
    return state.screen === 'home' ? ['{A} Choose'] : ['{A} Choose', '{B} Back'];
  }
  if (state.screen === 'home') {
    const hints = ['{[↑↓]} Select'];
    if (state.stops.length > 1) hints.push('{[←→]} Episode');
    hints.push('{Enter} Choose');
    return hints;
  }
  if (state.screen === 'settings') return ['{[↑↓]} Select', '{[←→]} Change', '{Esc} Back'];
  return ['{[↑↓]} Select', '{Enter} Choose', '{Esc} Back'];
}
