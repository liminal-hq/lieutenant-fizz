// Tests for when the cursor hides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { CURSOR_IDLE_MS, cursorHidden } from './cursor';
import type { ShellScreen } from './touch-menus';

const SCREENS: ShellScreen[] = [
  'loading',
  'title',
  'cine',
  'play',
  'pause',
  'card',
  'dialogue',
  'ending',
  'credits',
  'stinger',
];

describe('cursorHidden', () => {
  it('hides only in play, once the mouse has rested', () => {
    for (const s of SCREENS) {
      expect(cursorHidden(s, CURSOR_IDLE_MS + 1, 'game')).toBe(s === 'play');
    }
  });

  it('waits for the idle time', () => {
    expect(cursorHidden('play', 0, 'game')).toBe(false);
    expect(cursorHidden('play', CURSOR_IDLE_MS - 1, 'game')).toBe(false);
    expect(cursorHidden('play', CURSOR_IDLE_MS, 'game')).toBe(true);
    expect(cursorHidden('play', Infinity, 'game')).toBe(true);
  });

  it('never hides over the overlay controls', () => {
    for (const s of SCREENS) expect(cursorHidden(s, Infinity, 'ui')).toBe(false);
  });
});
