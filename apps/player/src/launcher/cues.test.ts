// Tests for which sound each launcher action makes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { cueOf } from './cues';
import { initialState, reduce, type Action, type LauncherState } from './state';

const cue = (state: LauncherState, action: Action) => cueOf(state, action, reduce(state, action));
const about = reduce(initialState(false), { type: 'activate', row: 'about' }).state;
const aboutUnlocked = reduce(initialState(true), { type: 'activate', row: 'about' }).state;

describe('the launcher menu sounds', () => {
  it('chooses a row with the select cue, whether it opens a screen or goes to a page', () => {
    expect(cue(initialState(false), { type: 'activate', row: 'about' })).toBe('select');
    expect(cue(initialState(false), { type: 'activate', row: 'episode-1' })).toBe('select');
    expect(cue(about, { type: 'activate', row: 'version' })).toBe('select');
  });

  it('plays the back cue for Back from About and for the Back row, and nothing at the home screen', () => {
    expect(cue(about, { type: 'back' })).toBe('back');
    expect(cue(about, { type: 'activate', row: 'back' })).toBe('back');
    expect(cue(initialState(false), { type: 'back' })).toBeUndefined();
  });

  it('plays the change cue for hiding the debug menu and "no" for a row that is not there', () => {
    expect(cue(aboutUnlocked, { type: 'activate', row: 'hide-debug' })).toBe('change');
    expect(cue(initialState(false), { type: 'activate', row: 'version' })).toBe('deny');
  });

  it('counts a Version choice that only moves the count as a select', () => {
    const step = reduce(about, { type: 'activate', row: 'version' });
    expect(step.effects).toEqual([]);
    expect(step.state).not.toBe(about);
    expect(cueOf(about, { type: 'activate', row: 'version' }, step)).toBe('select');
  });
});
