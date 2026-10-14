// What the launcher does for the desktop app: start fullscreen when asked, and the keys for fullscreen.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HostKind } from '@lieutenant-fizz/engine/host';

/** Remembers, for this run of the app, that the saved fullscreen choice has been applied. */
export const FULLSCREEN_START_KEY = 'lf-launcher-fs-v1';

export interface FullscreenStart {
  kind: HostKind;
  /** The saved Fullscreen option: 0 Auto, 1 On, 2 Off. */
  fullscreen: number;
  /** Lasts as long as the app run: `sessionStorage`. */
  session: Pick<Storage, 'getItem' | 'setItem'>;
}

/**
 * Whether the window should go fullscreen now. Only the desktop app does it, only when the saved Fullscreen
 * option is On, and only once per run of the app: coming back from a game must not take the window
 * fullscreen again if the player left it. The game applies the same option when it opens on its own.
 */
export function shouldStartFullscreen(start: FullscreenStart): boolean {
  if (start.kind !== 'tauri-desktop') return false;
  let done = false;
  try {
    done = start.session.getItem(FULLSCREEN_START_KEY) === '1';
    if (!done) start.session.setItem(FULLSCREEN_START_KEY, '1');
  } catch {
    /* no session storage: fall back to asking every time */
  }
  return !done && start.fullscreen === 1;
}

/** The parts of a key event the fullscreen keys read. */
export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

/**
 * What a key does about fullscreen. `F11` and `F` toggle it. Esc leaves it when the screen has nowhere to go
 * Back to (the home screen), as the game's title does; on a sub-screen Esc goes back as usual and fullscreen stays.
 */
export function fullscreenKey(
  e: KeyLike,
  fullscreen: boolean,
  hasBack: boolean,
): 'toggle' | 'exit' | undefined {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return undefined;
  if (e.code === 'F11' || e.key === 'F11') return 'toggle';
  if ((e.key === 'f' || e.key === 'F') && !e.shiftKey) return 'toggle';
  if (e.key === 'Escape' && fullscreen && !hasBack) return 'exit';
  return undefined;
}
