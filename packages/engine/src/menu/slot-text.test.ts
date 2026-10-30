// Tests for the save slot text.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  clearedCount,
  formatDate,
  formatPlayed,
  slotBrief,
  slotDetail,
  slotName,
  slotTitle,
  type SlotSummary,
} from './slot-text';

const full = (over: Partial<SlotSummary> = {}): SlotSummary => ({
  id: 2,
  name: 'Slot 2',
  empty: false,
  readOnly: false,
  place: 'Rock Candy Reach',
  cleared: 2,
  total: 8,
  lives: 3,
  score: 1240,
  played: '0:42',
  date: 'Wed, Oct. 7',
  ...over,
});
const empty = (): SlotSummary =>
  full({ empty: true, place: '', cleared: 0, lives: 0, score: 0, played: '', date: '' });

describe('slot text', () => {
  it('names the autosave, the four slots and the quick-save', () => {
    expect(slotName('auto')).toBe('Autosave');
    expect(slotName(3)).toBe('Slot 3');
    expect(slotName('quick')).toBe('Quick save');
  });

  it('counts cleared levels out of the total and ignores the secret flag above it', () => {
    expect(clearedCount(0, 8)).toBe(0);
    expect(clearedCount(0b101, 8)).toBe(2);
    expect(clearedCount(0x8000, 8)).toBe(0);
    expect(clearedCount(0x8000 | 0xff, 8)).toBe(8);
  });

  it('formats time played as hours and minutes', () => {
    expect(formatPlayed(0)).toBe('0:00');
    expect(formatPlayed(42 * 60)).toBe('0:42');
    expect(formatPlayed(72 * 60 + 59)).toBe('1:12');
    expect(formatPlayed(-5)).toBe('0:00');
  });

  it('formats the date in Canadian English', () => {
    const d = formatDate(Date.UTC(2026, 9, 7, 16), 'UTC');
    expect(d).toMatch(/Wed/);
    expect(d).toMatch(/Oct/);
    expect(d).toMatch(/7/);
  });

  it('does not throw for a date outside the range a Date can hold', () => {
    expect(formatDate(1e300)).toBe('');
    expect(formatDate(Number.NaN)).toBe('');
  });

  it('writes the title, brief and detail of a slot row', () => {
    expect(slotTitle(full())).toBe('Slot 2 · Rock Candy Reach');
    expect(slotBrief(full(), 'load')).toBe('Lives 3 · 1,240 pts · 0:42');
    expect(slotDetail(full(), 'load')).toBe('Lives 3 · 1,240 pts · 0:42 played · Wed, Oct. 7');
    expect(slotDetail(full({ readOnly: true }), 'load')).toMatch(/read-only$/);
  });

  it('shows an empty slot with a hint that depends on the mode', () => {
    expect(slotTitle(empty())).toBe('Slot 2 · Empty');
    expect(slotBrief(empty(), 'save')).toBe('Save here');
    expect(slotBrief(empty(), 'load')).toBe('Nothing saved');
    expect(slotDetail(empty(), 'save')).toBe('Save here');
    expect(slotDetail(empty(), 'load')).toBe('Save from the pause menu to use this slot');
  });
});
