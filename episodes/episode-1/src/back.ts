// What the browser's Back button does on each screen, and when the game takes it over at all.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { FullscreenBackend } from '@lieutenant-fizz/engine/fullscreen-backend';
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

/** What Esc does: what a `pause` command does, or leave fullscreen (from the top of a menu, with Esc locked). */
export type EscAction = PauseAction | 'exitFullscreen';

/**
 * What the Esc key does. Esc is a `pause` command (`pauseAction` with no `leave`) except where the page
 * is fullscreen and Esc reaches it (`escapeCaptured`: the browser's Keyboard Lock is held, or a native
 * window): there the top of the pause menu and the top of the title have nothing left to close, and Esc
 * leaves fullscreen (the pause menu stays open, so a second Esc is not needed to find it again). The pause
 * menu is then resumed with its Resume row, P or the Pause key. Without capture the browser takes the key
 * and the page never sees it, so a key that does arrive is an ordinary one. Fullscreen state comes from the
 * backend only, never the DOM.
 */
export function escAction(
  screen: ShellScreen,
  sub: SubScreen,
  fs: Pick<FullscreenBackend, 'isFullscreen' | 'escapeCaptured'>,
): EscAction {
  if (fs.isFullscreen() && fs.escapeCaptured && !sub && (screen === 'pause' || screen === 'title'))
    return 'exitFullscreen';
  return pauseAction(screen, sub, false);
}

/** The element a screen is drawn in: the full-screen overlay, or the title's own (which also holds the Controls table). */
export type PeekLayer = 'overlay' | 'title';

/** What a Back gesture reveals as it slides a screen away. */
export interface PeekPlan {
  /** The element the screen being left is drawn in; a copy of it slides away. */
  layer: PeekLayer;
  /** What Back goes to: the game itself (the pause menu resumes), or the menu screen under it (`null` is the menu's own top level). */
  parent: { game: true } | { game: false; sub: SubScreen };
}

/**
 * Whether a Back gesture on this screen gets a peek, and what it reveals. The pause menu peeks onto the
 * game; every screen opened over the title or the pause menu (Controls, Options and the screens over it,
 * Saves) peeks onto the screen under it, `under` (the one that opened it, `null` for the menu's top
 * level). The title's top level has no peek, since Back there backgrounds the app and the system draws
 * its own animation. The touch controls editor is a placement surface, not a sheet, so it has none, and
 * neither have the story screens, which Back skips or ignores.
 */
export function peekPlan(screen: ShellScreen, sub: SubScreen, under: SubScreen): PeekPlan | null {
  if (screen !== 'title' && screen !== 'pause') return null;
  if (!sub) return screen === 'pause' ? { layer: 'overlay', parent: { game: true } } : null;
  if (sub === 'touchEdit') return null;
  return {
    layer: screen === 'title' && sub === 'controls' ? 'title' : 'overlay',
    parent: { game: false, sub: under },
  };
}
