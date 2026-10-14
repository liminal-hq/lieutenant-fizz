// Tests for which sound each launcher action makes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { stopsOf } from './catalog';
import { cueOf } from './cues';
import { initialState, reduce, type Action, type LauncherState } from './state';

const STOPS = stopsOf({
  episodes: [
    { id: 'episode-1', number: 1, title: 'One', status: 'playable' },
    { id: 'episode-2', number: 2, status: 'coming-soon' },
  ],
});

const cue = (state: LauncherState, action: Action) => cueOf(state, action, reduce(state, action));
const home = initialState(STOPS, false);
const app = reduce(reduce(home, { type: 'stop', dir: 1 }).state, { type: 'stop', dir: 1 }).state;
const about = reduce(app, { type: 'activate', row: 'about' }).state;
const aboutUnlocked = reduce(reduce(initialState(STOPS, true), { type: 'stop', dir: 1 }).state, {
  type: 'stop',
  dir: 1,
}).state;
const aboutOpen = reduce(aboutUnlocked, { type: 'activate', row: 'about' }).state;

describe('the launcher menu sounds', () => {
  it('chooses a row with the select cue, whether it opens a screen or starts a game', () => {
    expect(cue(home, { type: 'activate', row: 'new' })).toBe('select');
    expect(cue(app, { type: 'activate', row: 'about' })).toBe('select');
    expect(cue(about, { type: 'activate', row: 'version' })).toBe('select');
  });

  it('swipes when it steps to another stop, and is silent at either end', () => {
    expect(cue(home, { type: 'stop', dir: 1 })).toBe('swipe');
    expect(cue(home, { type: 'stop', dir: -1 })).toBeUndefined();
    expect(cue(app, { type: 'stop', dir: 1 })).toBeUndefined();
  });

  it('plays the back cue for Back from a screen and for the Back row, and nothing at the home screen', () => {
    expect(cue(about, { type: 'back' })).toBe('back');
    expect(cue(about, { type: 'activate', row: 'back' })).toBe('back');
    expect(cue(home, { type: 'back' })).toBeUndefined();
  });

  it('plays the change cue for hiding the debug menu, and "no" for a row that does nothing', () => {
    expect(cue(aboutOpen, { type: 'activate', row: 'hide-debug' })).toBe('change');
    expect(cue(home, { type: 'activate', row: 'version' })).toBe('deny');
    const soon = reduce(home, { type: 'stop', dir: 1 }).state;
    expect(cue(soon, { type: 'activate', row: 'soon' })).toBe('deny');
  });

  it('counts a Version choice that only moves the count as a select', () => {
    const step = reduce(about, { type: 'activate', row: 'version' });
    expect(step.effects).toEqual([]);
    expect(step.state).not.toBe(about);
    expect(cueOf(about, { type: 'activate', row: 'version' }, step)).toBe('select');
  });
});

describe('the Settings sounds', () => {
  const settings = reduce(app, { type: 'activate', row: 'settings' }).state;

  it('changes a value with the change cue, and is silent where a meter cannot go further', () => {
    expect(cue(settings, { type: 'step', row: 'opt:music', dir: -1 })).toBe('change');
    expect(cue(settings, { type: 'activate', row: 'opt:audio' })).toBe('change');
    expect(cue(settings, { type: 'activate', row: 'tab' })).toBe('change');
    // Music starts at full, so there is nothing further up.
    expect(cue(settings, { type: 'step', row: 'opt:music', dir: 1 })).toBeUndefined();
  });

  it('selects on the first tap on Reset and changes on the second', () => {
    const armed = reduce(settings, { type: 'activate', row: 'reset' }).state;
    expect(cue(settings, { type: 'activate', row: 'reset' })).toBe('select');
    expect(cue(armed, { type: 'activate', row: 'reset' })).toBe('change');
  });
});
