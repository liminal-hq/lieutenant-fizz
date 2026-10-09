// Which screens keep the display on, and which taps start or resume a run.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Gesture } from '@lieutenant-fizz/engine/lifecycle-policy';
import type { ShellScreen, SubScreen } from './touch-menus';

/** Whether the screen is one the player is playing or watching (the display should stay on). */
export function isLive(screen: ShellScreen, sub: SubScreen): boolean {
  if (sub !== null) return false;
  switch (screen) {
    case 'play':
    case 'cine':
    case 'dialogue':
    case 'ending':
    case 'credits':
    case 'stinger':
    case 'card':
      return true;
    case 'loading':
    case 'title':
    case 'pause':
      return false;
  }
}

/**
 * What choosing a row does for fullscreen: New game, Continue and a Load slot on the title start a run,
 * Resume on the pause menu resumes one; everything else (Options, Controls, Save, a slot over the pause
 * menu) is neither.
 */
export function gestureFor(
  screen: ShellScreen,
  sub: SubScreen,
  rowId: string,
  saveMode: 'save' | 'load',
): Gesture {
  if (screen === 'title' && sub === null) {
    return rowId === 'new' || rowId === 'continue' ? 'start' : 'other';
  }
  if (screen === 'title' && sub === 'saves') {
    return saveMode === 'load' && rowId.startsWith('slot:') ? 'start' : 'other';
  }
  if (screen === 'pause' && sub === null) return rowId === 'resume' ? 'resume' : 'other';
  return 'other';
}
