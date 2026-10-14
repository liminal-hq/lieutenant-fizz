// Tests for the launcher's hints.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { stopsOf } from './catalog';
import { hintsOf } from './hints';
import { initialState, reduce } from './state';

const stops = stopsOf({
  episodes: [
    { id: 'a', number: 1, title: 'One', status: 'playable' },
    { id: 'b', number: 2, status: 'coming-soon' },
  ],
});

describe('the launcher hints', () => {
  it('say how to select, change episode and choose on the home screen, and add Back on a sub-screen', () => {
    const home = initialState(stops, false);
    expect(hintsOf(home)).toEqual(['{[↑↓]} Select', '{[←→]} Episode', '{Enter} Choose']);
    const app = reduce(reduce(home, { type: 'stop', dir: 1 }).state, {
      type: 'stop',
      dir: 1,
    }).state;
    const about = reduce(app, { type: 'activate', row: 'about' }).state;
    expect(hintsOf(about)).toEqual(['{[↑↓]} Select', '{Enter} Choose', '{Esc} Back']);
  });

  it('leave out Episode when there is one stop', () => {
    expect(hintsOf(initialState(stopsOf({ episodes: [] }), false))).toEqual([
      '{[↑↓]} Select',
      '{Enter} Choose',
    ]);
  });

  it('turn into keycap glyphs, not the braces', () => {
    for (const hint of hintsOf(initialState(stops, false))) {
      expect(hintText(hint)).not.toContain('{');
    }
  });

  it('follow the device in use: keys for a keyboard, buttons for a pad, nothing for touch', () => {
    const home = initialState(stops, false);
    const about = reduce(
      reduce(reduce(home, { type: 'stop', dir: 1 }).state, { type: 'stop', dir: 1 }).state,
      { type: 'activate', row: 'about' },
    ).state;
    expect(hintsOf(home, 'gamepad')).toEqual(['{A} Choose']);
    expect(hintsOf(about, 'gamepad')).toEqual(['{A} Choose', '{B} Back']);
    expect(hintsOf(home, 'touch')).toEqual([]);
    expect(hintsOf(about, 'touch')).toEqual([]);
    expect(hintsOf(home, 'keyboard')).toEqual(hintsOf(home));
    for (const hint of [...hintsOf(home, 'gamepad'), ...hintsOf(about, 'gamepad')]) {
      expect(hintText(hint)).not.toContain('{');
    }
  });
});
