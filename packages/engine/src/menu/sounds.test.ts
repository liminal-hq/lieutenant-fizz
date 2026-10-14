// Tests for the menu sounds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MENU_CUES, createMenuSounds, type MenuSounds } from './sounds';

const sounds: MenuSounds = {
  move: 'a',
  select: 'b',
  back: 'c',
  change: 'd',
  deny: 'e',
  swipe: 'f',
};

describe('the menu sounds', () => {
  it('plays the effect the episode gave for each cue, once', () => {
    const played: string[] = [];
    const player = createMenuSounds(sounds, (name) => played.push(name));
    for (const cue of MENU_CUES) player.cue(cue);
    expect(played).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('lets another episode name other effects for the same cues', () => {
    const played: string[] = [];
    createMenuSounds({ ...sounds, move: 'blip' }, (name) => played.push(name)).cue('move');
    expect(played).toEqual(['blip']);
  });
});
