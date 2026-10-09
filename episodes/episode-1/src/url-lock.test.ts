// Tests for the address-fixed rows: the `?haptics` value, the "(link)" text and the first row to land on.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { firstEnabled, linkValue, lockedItem, parseHapticsParam } from './url-lock';

describe('parseHapticsParam', () => {
  it('reads the bare flag and =on as on, and =off as off', () => {
    const q = (s: string) => parseHapticsParam(new URLSearchParams(s).get('haptics'));
    expect(q('haptics')).toBe('on');
    expect(q('haptics=')).toBe('on');
    expect(q('haptics=on')).toBe('on');
    expect(q('haptics=off')).toBe('off');
    expect(q('debug&haptics=OFF')).toBe('off');
    expect(q('haptics=On')).toBe('on');
  });

  it('chooses nothing without the flag or with a value it does not know', () => {
    const q = (s: string) => parseHapticsParam(new URLSearchParams(s).get('haptics'));
    expect(q('')).toBeUndefined();
    expect(q('debug&audio=classic')).toBeUndefined();
    expect(q('haptics=maybe')).toBeUndefined();
    expect(q('haptics=1')).toBeUndefined();
    expect(parseHapticsParam(undefined)).toBeUndefined();
    expect(parseHapticsParam(null)).toBeUndefined();
  });
});

describe('lockedItem', () => {
  it('shows the value with (link) on a choice row that cannot be chosen', () => {
    expect(linkValue('Off')).toBe('Off (link)');
    expect(lockedItem({ id: 'x', label: 'Style' }, 'Classic')).toEqual({
      id: 'x',
      label: 'Style',
      kind: 'choice',
      value: 'Classic (link)',
      disabled: true,
    });
  });
});

describe('firstEnabled', () => {
  it('lands on the first row that is not disabled, or the top when none is', () => {
    expect(firstEnabled([{ label: 'a', disabled: true }, { label: 'b' }, { label: 'c' }])).toBe(1);
    expect(firstEnabled([{ label: 'a' }])).toBe(0);
    expect(firstEnabled([{ label: 'a', disabled: true }])).toBe(0);
    expect(firstEnabled([])).toBe(0);
  });
});
