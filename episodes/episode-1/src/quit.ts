// The Quit to launcher and Quit game rows of the title and pause menus, which only the apps have.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MenuItem } from './ui';

/** The menu id of the Quit game row (the pause menu's "Quit to title" is `quit`). */
export const QUIT_GAME_ID = 'exit';

/** The menu id of the Quit to launcher row. */
export const QUIT_LAUNCHER_ID = 'launcher';

/** How the armed row reads: the first tap on the pause menu's quit rows waits for a second. */
export const QUIT_ARMED_VALUE = 'Tap again';

/** Which of the app-only rows the host can do. */
export interface QuitCapabilities {
  /** Quit game: the desktop app. */
  game: boolean;
  /** Quit to launcher: the desktop and Android apps. */
  launcher: boolean;
}

/**
 * The menu with Quit to launcher and then Quit game last, for what the host can do. `confirm` is for the
 * pause menu, where the first tap arms a row (`armed` is its id) and the second does it; the title does it
 * on one tap. `launcherLabel` is the launcher row's text: an episode the launcher started says "Back to launcher". Without either capability the rows are returned as they are, so the web menus never change.
 */
export function withQuitRows(
  items: MenuItem[],
  can: QuitCapabilities,
  confirm: boolean,
  armed: string | null,
  launcherLabel = 'Quit to launcher',
): MenuItem[] {
  if (!can.game && !can.launcher) return items;
  const row = (id: string, label: string): MenuItem => ({
    id,
    label,
    ...(confirm && armed === id ? { value: QUIT_ARMED_VALUE } : {}),
  });
  return [
    ...items,
    ...(can.launcher ? [row(QUIT_LAUNCHER_ID, launcherLabel)] : []),
    ...(can.game ? [row(QUIT_GAME_ID, 'Quit game')] : []),
  ];
}
