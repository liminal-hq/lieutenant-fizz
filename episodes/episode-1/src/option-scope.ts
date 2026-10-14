// What an Options change applies to: every episode, or this one alone, and which rows this episode overrides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Scope } from '@lieutenant-fizz/engine/options-file';
import { EPISODE_ID } from './options';
import type { MenuItem } from './ui';

/** Where a change on the Options screens goes. */
export type OptionScope = 'global' | 'episode';

/** The words the Applies to row shows. */
export const SCOPE_NAMES: Readonly<Record<OptionScope, string>> = {
  global: 'All episodes',
  episode: 'This episode',
};

/** The scope as the options file takes it. */
export const fileScope = (scope: OptionScope): Scope =>
  scope === 'global' ? 'global' : { episode: EPISODE_ID };

/** The options on the Sound screen, which its Reset puts back. */
export const SOUND_KEYS = ['audio', 'music', 'sfx', 'musicVersion', 'sfxVersion'] as const;

/** The options on the Display screen. */
export const DISPLAY_KEYS = ['fullscreen', 'awake', 'density'] as const;

/** The options a menu row stands for: an Options row its own, a link to Sound or Display those on it. */
export function rowKeys(id: string): readonly string[] {
  if (id.startsWith('opt:')) return [id.slice(4)];
  if (id === 'sound') return SOUND_KEYS;
  if (id === 'display') return DISPLAY_KEYS;
  const sound: Record<string, string> = {
    'sound:style': 'audio',
    'sound:music': 'music',
    'sound:sfx': 'sfx',
    'sound:musicVersion': 'musicVersion',
    'sound:sfxVersion': 'sfxVersion',
  };
  if (sound[id]) return [sound[id]];
  if (id.startsWith('display:')) {
    const key = id.slice(8);
    return (DISPLAY_KEYS as readonly string[]).includes(key) ? [key] : [];
  }
  return [];
}

/** The rows of a screen with a `*` after the name of each that this episode overrides. */
export function markOverrides(
  items: readonly MenuItem[],
  overridden: ReadonlySet<string>,
): MenuItem[] {
  if (overridden.size === 0) return [...items];
  return items.map((item) =>
    rowKeys(item.id ?? '').some((k) => overridden.has(k))
      ? { ...item, label: `${item.label} *` }
      : item,
  );
}
