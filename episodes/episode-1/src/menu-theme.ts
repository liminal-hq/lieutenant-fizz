// Episode 1's menu look: the amber plate, its colours and the can of cream soda for a bullet.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Grid } from '@lieutenant-fizz/engine/pen';
import type { MenuTheme } from '@lieutenant-fizz/engine/menu/theme';

/** The colours and plate steps the menus have always had (the defaults in the engine's `tokens.css`). */
export const EPISODE_1_MENU = {
  colours: {
    text: '#e0e0e0',
    dim: '#7c8796',
    accent: '#ffaa40',
    muted: '#b4bfce',
    ink: '#1a1000',
  },
  plate: ['#ffaa40', '#ffb850', '#ffc860'],
} as const satisfies MenuTheme;

/** The theme with its bullet: the soda can. */
export function episodeMenuTheme(soda: Grid | undefined): MenuTheme {
  return soda ? { ...EPISODE_1_MENU, bullet: soda } : { ...EPISODE_1_MENU };
}
