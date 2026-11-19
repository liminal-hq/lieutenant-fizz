// Tests for the hidden Debug menu: the key sequence and the rows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEBUG_SEQUENCE,
  DEBUG_SEQUENCE_MS,
  createSequenceMatcher,
  debugActionOf,
  debugItems,
  warpItems,
  warpLevelOf,
} from './debug-menu';
import { LEVELS } from './story';

const matcher = () => createSequenceMatcher(DEBUG_SEQUENCE, DEBUG_SEQUENCE_MS);

describe('the debug key sequence', () => {
  it('opens on 2 then Enter', () => {
    const m = matcher();
    expect(m.press('Digit2', 0)).toBe(false);
    expect(m.press('Enter', 100)).toBe(true);
  });

  it('accepts the keypad keys', () => {
    const m = matcher();
    m.press('Numpad2', 0);
    expect(m.press('NumpadEnter', 100)).toBe(true);
  });

  it('does nothing on Enter alone', () => {
    const m = matcher();
    expect(m.press('Enter', 0)).toBe(false);
    expect(m.press('Enter', 50)).toBe(false);
  });

  it('forgets the 2 once the timeout has passed', () => {
    const m = matcher();
    m.press('Digit2', 0);
    expect(m.press('Enter', DEBUG_SEQUENCE_MS + 1)).toBe(false);
  });

  it('still opens at exactly the timeout', () => {
    const m = matcher();
    m.press('Digit2', 0);
    expect(m.press('Enter', DEBUG_SEQUENCE_MS)).toBe(true);
  });

  it('starts over on a wrong key', () => {
    const m = matcher();
    m.press('Digit2', 0);
    m.press('ArrowDown', 100);
    expect(m.press('Enter', 200)).toBe(false);
  });

  it('counts a repeated 2 as a fresh start', () => {
    const m = matcher();
    m.press('Digit2', 0);
    m.press('Digit2', 1000);
    expect(m.press('Enter', 2200)).toBe(true);
  });

  it('needs the whole sequence again after it opens', () => {
    const m = matcher();
    m.press('Digit2', 0);
    m.press('Enter', 10);
    expect(m.press('Enter', 20)).toBe(false);
  });

  it('forgets progress on reset', () => {
    const m = matcher();
    m.press('Digit2', 0);
    m.reset();
    expect(m.press('Enter', 10)).toBe(false);
  });
});

describe('the debug menu rows', () => {
  it('lists Warp to level and Mode, then Back', () => {
    const items = debugItems();
    expect(items.map((i) => i.label)).toEqual(['Warp to level', 'Mode', 'Back']);
    expect(debugActionOf(items[0]?.id)).toBe('warp');
    expect(debugActionOf(items[1]?.id)).toBe('mode');
    expect(debugActionOf('back')).toBeNull();
  });

  it('shows the mode in use on the Mode row', () => {
    expect(debugItems(false)[1]?.value).toBe('Expert');
    expect(debugItems(true)[1]?.value).toBe('Normal');
  });

  it('lists every level by name and number, in table order, then Back', () => {
    const items = warpItems(LEVELS);
    expect(items).toHaveLength(LEVELS.length + 1);
    LEVELS.forEach((level, i) => {
      expect(items[i]?.label).toBe(level.name);
      expect(items[i]?.value).toBe(`${i + 1}`);
      expect(warpLevelOf(items[i]?.id)).toBe(i);
    });
    expect(items.at(-1)).toEqual({ id: 'back', label: 'Back' });
    expect(items.at(-2)?.label).toBe('The Saucer');
  });

  it('reads no level from other ids', () => {
    expect(warpLevelOf('back')).toBeNull();
    expect(warpLevelOf('warp:x')).toBeNull();
    expect(warpLevelOf(undefined)).toBeNull();
  });
});
