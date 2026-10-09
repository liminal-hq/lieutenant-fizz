// Tests for the screens that keep the display on and the taps that start a run.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { gestureFor, isLive } from './lifecycle-rules';
import type { ShellScreen, SubScreen } from './touch-menus';

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
const SUBS: SubScreen[] = [null, 'controls', 'options', 'saves', 'touch', 'touchEdit'];
const LIVE: ShellScreen[] = ['play', 'cine', 'dialogue', 'ending', 'credits', 'stinger', 'card'];

describe('isLive', () => {
  it('is live on the playing and watching screens, with nothing over them', () => {
    for (const s of SCREENS) expect(isLive(s, null)).toBe(LIVE.includes(s));
  });

  it('is never live with a screen over it', () => {
    for (const s of SCREENS)
      for (const sub of SUBS.filter((x) => x !== null)) expect(isLive(s, sub)).toBe(false);
  });
});

describe('gestureFor', () => {
  it('starts a run from New game, Continue and a Load slot on the title', () => {
    expect(gestureFor('title', null, 'new', 'load')).toBe('start');
    expect(gestureFor('title', null, 'continue', 'load')).toBe('start');
    expect(gestureFor('title', 'saves', 'slot:2', 'load')).toBe('start');
    expect(gestureFor('title', 'saves', 'slot:auto', 'load')).toBe('start');
  });

  it('resumes from the pause menu', () => {
    expect(gestureFor('pause', null, 'resume', 'load')).toBe('resume');
  });

  it('is neither for the other title and pause rows', () => {
    for (const id of ['load', 'options', 'controls', 'back']) {
      expect(gestureFor('title', null, id, 'load')).toBe('other');
    }
    for (const id of ['save', 'load', 'options', 'leave', 'quit']) {
      expect(gestureFor('pause', null, id, 'load')).toBe('other');
    }
  });

  it('is not a start for a slot while saving, nor for Back on the saves screen', () => {
    expect(gestureFor('title', 'saves', 'slot:1', 'save')).toBe('other');
    expect(gestureFor('title', 'saves', 'back', 'load')).toBe('other');
  });

  it('is other over the pause menu and everywhere else', () => {
    expect(gestureFor('pause', 'saves', 'slot:1', 'load')).toBe('other');
    expect(gestureFor('pause', 'options', 'resume', 'load')).toBe('other');
    for (const s of SCREENS.filter((x) => x !== 'title' && x !== 'pause')) {
      for (const sub of SUBS) {
        for (const id of ['new', 'continue', 'resume', 'slot:1']) {
          expect(gestureFor(s, sub, id, 'load')).toBe('other');
        }
      }
    }
  });
});
