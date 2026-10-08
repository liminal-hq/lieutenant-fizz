// Tests for the on-screen controls each screen shows and their labels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { touchFaces, type ShellScreen } from './touch-menus';

const ALL: ShellScreen[] = [
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

describe('touchFaces', () => {
  it('shows every control in play, as Jump and Pogo', () => {
    expect(touchFaces('play', null)).toEqual({
      shown: ['dpad', 'jump', 'pogo', 'fire', 'pause'],
      jump: 'Jump',
      pogo: 'Pogo',
      play: true,
    });
  });

  it('turns the controls into a gamepad on menus: the D-pad, Select and Pause', () => {
    expect(touchFaces('pause', null).shown).toEqual(['dpad', 'jump', 'pause']);
    expect(touchFaces('pause', null).jump).toBe('Select');
    // Pause has no job on the title or a card, so it hides there.
    expect(touchFaces('title', null).shown).toEqual(['dpad', 'jump']);
    expect(touchFaces('card', null).shown).toEqual(['dpad', 'jump']);
  });

  it('adds Back, and drops Pause, on a screen opened over a menu', () => {
    for (const sub of ['options', 'saves', 'controls', 'touch'] as const) {
      for (const screen of ['title', 'pause'] as const) {
        const f = touchFaces(screen, sub);
        expect(f.shown).toEqual(['dpad', 'jump', 'pogo']);
        expect(f.pogo).toBe('Back');
      }
    }
  });

  it('keeps the D-pad off the text screens, and Pause where it skips', () => {
    expect(touchFaces('cine', null).shown).toEqual(['jump', 'pause']);
    expect(touchFaces('credits', null).shown).toEqual(['jump', 'pause']);
    expect(touchFaces('stinger', null).shown).toEqual(['jump', 'pause']);
    expect(touchFaces('dialogue', null).shown).toEqual(['jump']);
    expect(touchFaces('ending', null).shown).toEqual(['jump']);
  });

  it('never shows Fizz outside play, and shows nothing while loading', () => {
    for (const s of ALL) if (s !== 'play') expect(touchFaces(s, null).shown).not.toContain('fire');
    expect(touchFaces('loading', null).shown).toEqual([]);
  });
});
