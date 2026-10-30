// Tests for the save-slot summaries and their formatting.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { Stored } from './save';
import { slotBrief, slotDetail, slotTitle } from '@lieutenant-fizz/engine/menu/slot-text';
import { AREA_NAMES, LEVEL_TOTAL, areaName, clearedCount, summarise } from './slots';

const stored = (over: Partial<Stored['progress']> = {}, at = Date.UTC(2026, 9, 7, 16)): Stored => ({
  v: 3,
  at,
  progress: {
    lives: 3,
    score: 1240,
    nextLife: 1300,
    ammo: 5,
    doneMask: 0b101,
    played: 2520,
    ...over,
  },
});

describe('slot text', () => {
  it('counts cleared levels and ignores the secret flag', () => {
    expect(clearedCount(0)).toBe(0);
    expect(clearedCount(0b101)).toBe(2);
    expect(clearedCount(0x8000)).toBe(0);
    expect(clearedCount(0x8000 | 0x7fff)).toBe(LEVEL_TOTAL);
  });

  it('names areas and falls back to the first for an unknown id', () => {
    expect(areaName(1)).toBe('Marshmallow Meadows');
    expect(areaName(99)).toBe(AREA_NAMES[0]);
  });
});

describe('slotBrief', () => {
  it('keeps lives, score and time played, and drops the date', () => {
    expect(slotBrief(summarise(1, stored(), 'Crater Fields'), 'load')).toBe(
      'Lives 3 · 1,240 pts · 0:42',
    );
  });

  it('says what an empty slot is for', () => {
    expect(slotBrief(summarise(2, null, ''), 'save')).toBe('Save here');
    expect(summarise('quick', null, '').name).toBe('Quick save');
    expect(summarise('quick', null, '').readOnly).toBe(true);
    expect(summarise(2, null, '').readOnly).toBe(false);
    expect(slotBrief(summarise(2, null, ''), 'load')).toBe('Nothing saved');
  });
});

describe('summarise', () => {
  it('summarises a save', () => {
    const s = summarise(2, stored(), 'Rock Candy Reach');
    expect(s).toMatchObject({
      id: 2,
      name: 'Slot 2',
      empty: false,
      readOnly: false,
      place: 'Rock Candy Reach',
      cleared: 2,
      lives: 3,
      score: 1240,
      played: '0:42',
    });
    expect(s.total).toBe(LEVEL_TOTAL);
    expect(slotTitle(s)).toBe('Slot 2 · Rock Candy Reach');
  });

  it('marks the autosave read-only', () => {
    const s = summarise('auto', stored(), 'Crater Fields');
    expect(s.readOnly).toBe(true);
    expect(slotDetail(s, 'load')).toMatch(/read-only$/);
    expect(slotDetail(s, 'load')).toContain('Lives 3 · 1,240 pts · 0:42 played');
  });

  it('shows an empty slot with a hint that depends on the mode', () => {
    const s = summarise(4, null, '');
    expect(s.empty).toBe(true);
    expect(slotTitle(s)).toBe('Slot 4 · Empty');
    expect(slotDetail(s, 'save')).toBe('Save here');
    expect(slotDetail(s, 'load')).toBe('Save from the pause menu to use this slot');
  });
});
