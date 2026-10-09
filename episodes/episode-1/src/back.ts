// What the browser's Back button does on each screen, and when the game takes it over at all.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ShellScreen, SubScreen } from './touch-menus';

/**
 * What Back does: close the screen over a menu, pause, resume, skip the scene, do nothing (absorb it),
 * or `null` to leave it to the browser (which then leaves the page).
 */
export type BackAction = 'close' | 'pause' | 'resume' | 'skip' | 'none' | null;

/** The action for Back on a screen. Title with no screen over it, and loading, are left to the browser. */
export function backAction(screen: ShellScreen, sub: SubScreen): BackAction {
  switch (screen) {
    case 'title':
      return sub ? 'close' : null;
    case 'pause':
      return sub ? 'close' : 'resume';
    case 'play':
      return 'pause';
    case 'cine':
    case 'credits':
    case 'stinger':
      return 'skip';
    case 'dialogue':
    case 'ending':
    case 'card':
      return 'none';
    case 'loading':
      return null;
  }
}

/** What decides whether the game takes over Back. */
export interface BackContext {
  /** Installed: `display-mode` is standalone, fullscreen or minimal-ui, or `navigator.standalone`. */
  standalone: boolean;
  /** An element is fullscreen. */
  fullscreen: boolean;
  /** `?back`, for trying it in an ordinary tab. */
  forced: boolean;
}

/** Browser Back is the game's only in fullscreen or an installed app, or when forced for testing. */
export function backEnabled(c: BackContext): boolean {
  return c.standalone || c.fullscreen || c.forced;
}

/**
 * What a `pause` command does: pause in play; on a menu with a screen over it, close one level (Esc, P,
 * a gamepad's Start) or, from the on-screen Pause button (`leave`), leave the whole menu — resume over
 * the pause menu, back to the title's top level over the title; resume from the pause menu itself; skip
 * a cinematic, the credits or the stinger; nothing elsewhere.
 */
export type PauseAction =
  'pause' | 'close' | 'leaveToGame' | 'leaveToTitle' | 'resume' | 'skipCine' | 'skipEnding' | null;

export function pauseAction(screen: ShellScreen, sub: SubScreen, leave: boolean): PauseAction {
  if (screen === 'play') return 'pause';
  if (sub && (screen === 'pause' || screen === 'title')) {
    if (!leave) return 'close';
    return screen === 'pause' ? 'leaveToGame' : 'leaveToTitle';
  }
  if (screen === 'pause') return 'resume';
  if (screen === 'cine') return 'skipCine';
  if (screen === 'credits' || screen === 'stinger') return 'skipEnding';
  return null;
}
