// The Quit game row of the title and pause menus, which only the desktop app has.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MenuItem } from './ui';

/** The menu id of the Quit game row (the pause menu's "Quit to title" is `quit`). */
export const QUIT_GAME_ID = 'exit';

/** How the armed row reads: the first tap on the pause menu's Quit game waits for a second. */
export const QUIT_ARMED_VALUE = 'Tap again';

/**
 * The menu with Quit game last, when the host can quit. `confirm` is for the pause menu, where the first
 * tap arms the row (`armed`) and the second quits; the title quits on one tap. Without a quit capability
 * the rows are returned as they are, so the web and Android menus never change.
 */
export function withQuitRow(
  items: MenuItem[],
  can: boolean,
  confirm: boolean,
  armed: boolean,
): MenuItem[] {
  if (!can) return items;
  return [
    ...items,
    {
      id: QUIT_GAME_ID,
      label: 'Quit game',
      ...(confirm && armed ? { value: QUIT_ARMED_VALUE } : {}),
    },
  ];
}

/** The steps of closing the app, as the game wires them. */
export interface CloseSteps {
  exitFullscreen(): Promise<unknown>;
  /** The store's flush when it has one; it resolves `false` when the write failed. */
  flush?(): Promise<boolean>;
  quit(): Promise<void>;
}

/**
 * Leaves fullscreen, writes the store out and closes the app. A failed flush (for example no space left)
 * keeps the app open, since quitting would discard what only memory holds; it resolves `false` so the
 * caller can say so, and a second try flushes again. Resolves `true` once `quit` has been asked for.
 */
export async function closeApp(steps: CloseSteps): Promise<boolean> {
  await steps.exitFullscreen();
  if (steps.flush && !(await steps.flush())) return false;
  await steps.quit();
  return true;
}
