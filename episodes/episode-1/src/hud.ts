// What the phone HUD shows: the pills (an icon and a number each) and the key chips, as pure data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HudState } from './ui';

export type PillIcon = 'lives' | 'snacks' | 'fizz';

export interface Pill {
  icon: PillIcon;
  value: string;
  colour: string;
  /** What a screen reader says, since the pill itself is an icon and a number. */
  label: string;
}

export interface KeyChip {
  colour: string;
  label: string;
}

const GREEN = '#55ff55';
const YELLOW = '#ffff55';
const CYAN = '#55ffff';
const RED = '#ff5555';

/** The three pills and the keys the player holds. Lives never show below 0, and Fizz turns red at 0. */
export function pillItems(s: HudState): { pills: Pill[]; chips: KeyChip[] } {
  const lives = Math.max(0, s.lives);
  const score = Math.round(s.score).toLocaleString('en-CA');
  const pills: Pill[] = [
    { icon: 'lives', value: String(lives), colour: GREEN, label: `Lives ${lives}` },
    { icon: 'snacks', value: score, colour: YELLOW, label: `Score ${score}` },
    {
      icon: 'fizz',
      value: String(s.ammo),
      colour: s.ammo > 0 ? CYAN : RED,
      label: `Fizz ${s.ammo}`,
    },
  ];
  const chips: KeyChip[] = [];
  if (s.red) chips.push({ colour: RED, label: 'Red gumdrop' });
  if (s.blue) chips.push({ colour: '#8888ff', label: 'Blue gumdrop' });
  if (s.green) chips.push({ colour: GREEN, label: 'Green gumdrop' });
  if (s.usb) chips.push({ colour: YELLOW, label: 'Gold USB drive' });
  return { pills, chips };
}
