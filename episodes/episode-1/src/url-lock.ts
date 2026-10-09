// Rows the address decides: a `?audio=`, `?haptics=` or `?debug` value shows on its row as "(link)" and cannot be changed.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AudioMode } from '@lieutenant-fizz/engine/sound-field';
import type { MenuItem } from './ui';

/** What `?haptics` asks for: `on` (bare or `=on`) forces haptics on, `off` forces them off. */
export type HapticsUrl = 'on' | 'off';

/**
 * A `?haptics` value: nothing (the bare flag) or `on` forces haptics on and `off` forces them off, in any
 * case. Anything else, and a missing flag (`null`), chooses nothing.
 */
export function parseHapticsParam(value: string | null | undefined): HapticsUrl | undefined {
  if (value === null || value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  return v === '' || v === 'on' ? 'on' : v === 'off' ? 'off' : undefined;
}

/**
 * What the address fixes for this session. A row it fixes shows the fixed value and cannot be stepped,
 * and the fixed value is never saved: the player's own choice stays in storage for when the link is gone.
 */
export interface UrlLocks {
  /** `?audio=classic` or `?audio=enhanced`. */
  audio?: AudioMode | undefined;
  /** `?haptics` (on) or `?haptics=off`. */
  haptics?: HapticsUrl | undefined;
  /** `?debug`, which puts the Sound lab and the Haptics lab on the page whatever their options say. */
  debug: boolean;
}

/** Nothing fixed: a session without a link. */
export const NO_LOCKS: Readonly<UrlLocks> = { debug: false };

/** How a fixed value reads on its row. */
export const linkValue = (text: string): string => `${text} (link)`;

/** A choice row showing the value the address fixed, which cannot be stepped or chosen. */
export function lockedItem(base: Pick<MenuItem, 'id' | 'label'>, shown: string): MenuItem {
  return { ...base, kind: 'choice', value: linkValue(shown), disabled: true };
}

/** The first row that can be chosen (0 when none can), for a screen to start on. */
export const firstEnabled = (items: readonly MenuItem[]): number =>
  Math.max(
    0,
    items.findIndex((i) => !i.disabled),
  );
