// The Normal and Expert difficulty modes: their names, and the menu a new game asks them on.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MenuItem } from './ui';

/** A difficulty mode: Normal is gentler, Expert is the game as it was first made. Expert is also the default for old saves and recordings. */
export type Mode = 'normal' | 'expert';

/** The menu ids of the mode choice shown after New Game. */
export const MODE_NORMAL_ID = 'mode:normal';
export const MODE_EXPERT_ID = 'mode:expert';
export const MODE_BACK_ID = 'back';

/** The name of a mode as the menus show it. */
export const modeName = (normal: boolean): string => (normal ? 'Normal' : 'Expert');

/** The mode a save, replay or sim slot holds: a non-zero `State.NORMAL` is Normal. */
export const modeOf = (normal: boolean): Mode => (normal ? 'normal' : 'expert');

/** The rows of the mode choice, with Normal first (and so highlighted when the screen opens), then Back. */
export function modeItems(): MenuItem[] {
  return [
    { id: MODE_NORMAL_ID, label: 'Normal', value: 'Gentler' },
    { id: MODE_EXPERT_ID, label: 'Expert', value: 'Original' },
    { id: MODE_BACK_ID, label: 'Back' },
  ];
}

/** Whether a menu row id picks Normal, picks Expert, or is neither (null). */
export function modePicked(id: string | undefined): boolean | null {
  if (id === MODE_NORMAL_ID) return true;
  if (id === MODE_EXPERT_ID) return false;
  return null;
}
