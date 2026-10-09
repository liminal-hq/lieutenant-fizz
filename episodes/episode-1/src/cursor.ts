// When the mouse cursor hides: over the game while it is being played, after a short rest.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ShellScreen } from './touch-menus';

/** How long the mouse rests before the cursor hides, in milliseconds. */
export const CURSOR_IDLE_MS = 1500;

/** The overlay controls that stay clickable during play: the engine panel and the sound and haptics lab. */
export const CURSOR_UI_SELECTOR = '#panel, #panelBtn, #lab, #labBtn';

/**
 * Whether the cursor hides. Only in `play` (a level or the map), where nothing is clicked: every other
 * screen (title, pause, cards, dialogue, cinematics, ending and credits) has something the mouse can
 * press or skip, so the cursor stays. It hides once the mouse has rested for `CURSOR_IDLE_MS`, never
 * over the overlay controls (`over: 'ui'`), and a keyboard or gamepad player gets it hidden the same way.
 */
export function cursorHidden(
  screen: ShellScreen,
  mouseIdleMs: number,
  over: 'game' | 'ui',
): boolean {
  return screen === 'play' && over === 'game' && mouseIdleMs >= CURSOR_IDLE_MS;
}
