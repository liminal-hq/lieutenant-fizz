// The hints along the bottom of the launcher for a keyboard, written as the game writes its own.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { LauncherState } from './state';

/** One entry per hint, in the form `hintText` turns into keycaps: `{[↑↓]}` is a keycap, `{Enter}` a named key. */
export function hintsOf(state: LauncherState): string[] {
  if (state.screen === 'home') {
    const hints = ['{[↑↓]} Select'];
    if (state.stops.length > 1) hints.push('{[←→]} Episode');
    hints.push('{Enter} Choose');
    return hints;
  }
  return ['{[↑↓]} Select', '{Enter} Choose', '{Esc} Back'];
}
