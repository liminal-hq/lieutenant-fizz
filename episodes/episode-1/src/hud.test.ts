// Tests for the phone HUD's pills and key chips.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { pillItems } from './hud';
import type { HudState } from './ui';

const base: HudState = {
  score: 0,
  lives: 3,
  ammo: 5,
  red: false,
  blue: false,
  green: false,
  usb: false,
};

describe('pillItems', () => {
  it('shows lives, snacks and fizz in their colours', () => {
    const { pills, chips } = pillItems({ ...base, score: 1250 });
    expect(pills.map((p) => [p.icon, p.value, p.colour])).toEqual([
      ['lives', '3', '#55ff55'],
      ['snacks', '1,250', '#ffff55'],
      ['fizz', '5', '#55ffff'],
    ]);
    expect(chips).toEqual([]);
  });

  it('never shows lives below 0', () => {
    expect(pillItems({ ...base, lives: -2 }).pills[0]!.value).toBe('0');
  });

  it('turns Fizz red at 0 ammo', () => {
    expect(pillItems({ ...base, ammo: 0 }).pills[2]!.colour).toBe('#ff5555');
    expect(pillItems({ ...base, ammo: 1 }).pills[2]!.colour).toBe('#55ffff');
  });

  it('names each pill for a screen reader', () => {
    const labels = pillItems({ ...base, score: 40 }).pills.map((p) => p.label);
    expect(labels).toEqual(['Lives 3', 'Score 40', 'Fizz 5']);
  });

  it('lists a chip only for each key the player holds', () => {
    const { chips } = pillItems({ ...base, red: true, usb: true });
    expect(chips.map((c) => c.label)).toEqual(['Red gumdrop', 'Gold USB drive']);
    expect(pillItems({ ...base, blue: true, green: true }).chips.map((c) => c.label)).toEqual([
      'Blue gumdrop',
      'Green gumdrop',
    ]);
  });
});
