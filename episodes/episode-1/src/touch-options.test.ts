// Tests for the Touch controls rows, their text, stepping and the two-tap Reset.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH_SETTINGS, type TouchSettings } from '@lieutenant-fizz/engine/touch-settings';
import {
  isStepRow,
  resetArmed,
  resetTouch,
  stepTouch,
  touchItems,
  touchRowOf,
  touchRows,
} from './touch-options';

const base = (): TouchSettings => ({ ...DEFAULT_TOUCH_SETTINGS, pos: {} });

describe('touchRows', () => {
  it('lists seven rows when the device can vibrate', () => {
    expect(touchRows({ haptics: true })).toEqual([
      'size',
      'opacity',
      'hand',
      'haptics',
      'move',
      'reset',
      'back',
    ]);
  });

  it('leaves Haptics out when it cannot', () => {
    expect(touchRows({ haptics: false })).toEqual([
      'size',
      'opacity',
      'hand',
      'move',
      'reset',
      'back',
    ]);
  });
});

describe('touchItems', () => {
  const rows = touchRows({ haptics: true });

  it('shows the default values', () => {
    const items = touchItems(base(), rows, false);
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Size', 'Medium'],
      ['Opacity', '85%'],
      ['Left-handed', 'Off'],
      ['Haptics', 'On'],
      ['Move controls', undefined],
      ['Reset', undefined],
      ['Back', undefined],
    ]);
    // The four settings step on touch (◄ and ►); the links do not.
    expect(items.map((i) => i.kind)).toEqual([
      'choice',
      'choice',
      'choice',
      'choice',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('names each size and opacity and the hand', () => {
    const s = { ...base(), size: 'L' as const, opacity: 40, leftHanded: true, haptics: false };
    const v = touchItems(s, rows, false).map((i) => i.value);
    expect(v.slice(0, 4)).toEqual(['Large', '40%', 'On', 'Off']);
    expect(touchItems({ ...base(), size: 'S' }, rows, false)[0]?.value).toBe('Small');
  });

  it('says Custom once a control has moved, and Tap again while Reset is armed', () => {
    const s = { ...base(), pos: { dpad: { side: 75, bottom: 115 } } };
    const items = touchItems(s, rows, true);
    expect(items.find((i) => i.label === 'Move controls')?.value).toBe('Custom');
    expect(items.find((i) => i.label === 'Reset')?.value).toBe('Tap again');
  });

  it('gives every row an id that names it back', () => {
    const ids = touchItems(base(), rows, false).map((i) => touchRowOf(i.id));
    expect(ids).toEqual(rows);
    expect(touchRowOf('opt:music')).toBeNull();
    expect(touchRowOf('touch:nope')).toBeNull();
    expect(touchRowOf(undefined)).toBeNull();
  });
});

describe('stepTouch', () => {
  it('steps the size and stops at the ends when not wrapping', () => {
    let s = base();
    s = stepTouch(s, 'size', 1, false);
    expect(s.size).toBe('L');
    expect(stepTouch(s, 'size', 1, false).size).toBe('L');
    expect(stepTouch(base(), 'size', -1, false).size).toBe('S');
    expect(stepTouch(stepTouch(base(), 'size', -1, false), 'size', -1, false).size).toBe('S');
  });

  it('wraps round when the row is chosen', () => {
    expect(stepTouch({ ...base(), size: 'L' }, 'size', 1, true).size).toBe('S');
    expect(stepTouch({ ...base(), opacity: 100 }, 'opacity', 1, true).opacity).toBe(40);
    expect(stepTouch({ ...base(), opacity: 40 }, 'opacity', -1, true).opacity).toBe(100);
  });

  it('walks the opacity steps', () => {
    expect(stepTouch(base(), 'opacity', 1, false).opacity).toBe(100);
    expect(stepTouch(base(), 'opacity', -1, false).opacity).toBe(60);
    expect(stepTouch({ ...base(), opacity: 100 }, 'opacity', 1, false).opacity).toBe(100);
  });

  it('flips the hand and haptics either way', () => {
    expect(stepTouch(base(), 'hand', 1, false).leftHanded).toBe(true);
    expect(stepTouch(base(), 'hand', -1, false).leftHanded).toBe(true);
    expect(stepTouch(base(), 'haptics', 1, false).haptics).toBe(false);
  });

  it('leaves the other rows and the moved controls alone', () => {
    const s = { ...base(), pos: { jump: { side: 1, bottom: 2 } } };
    expect(stepTouch(s, 'move', 1, true)).toBe(s);
    expect(stepTouch(s, 'reset', 1, true)).toBe(s);
    expect(stepTouch(s, 'size', 1, false).pos).toEqual(s.pos);
    expect([isStepRow('size'), isStepRow('move'), isStepRow(null)]).toEqual([true, false, false]);
  });
});

describe('resetTouch', () => {
  it('gives fresh defaults, with positions cleared', () => {
    const r = resetTouch();
    expect(r).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(r.pos).not.toBe(DEFAULT_TOUCH_SETTINGS.pos);
  });
});

describe('resetArmed', () => {
  it('is armed for 3 seconds after the first tap', () => {
    expect(resetArmed(null, 5000)).toBe(false);
    expect(resetArmed(1000, 1000)).toBe(true);
    expect(resetArmed(1000, 3999)).toBe(true);
    expect(resetArmed(1000, 4000)).toBe(false);
  });
});
