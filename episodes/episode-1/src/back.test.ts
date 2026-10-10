// Tests for the browser Back rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { backAction, backEnabled, escAction, pauseAction, peekPlan } from './back';
import type { ShellScreen } from './touch-menus';

describe('backAction', () => {
  it('leaves the title to the browser, and closes a screen over it', () => {
    expect(backAction('title', null)).toBeNull();
    for (const sub of [
      'controls',
      'options',
      'saves',
      'sound',
      'haptics',
      'display',
      'touch',
    ] as const)
      expect(backAction('title', sub)).toBe('close');
  });

  it('resumes from the pause menu, and closes a screen over it', () => {
    expect(backAction('pause', null)).toBe('resume');
    for (const sub of [
      'controls',
      'options',
      'saves',
      'sound',
      'haptics',
      'display',
      'touch',
    ] as const)
      expect(backAction('pause', sub)).toBe('close');
  });

  it('pauses in play', () => {
    expect(backAction('play', null)).toBe('pause');
  });

  it('skips scenes', () => {
    for (const s of ['cine', 'credits', 'stinger'] as ShellScreen[])
      expect(backAction(s, null)).toBe('skip');
  });

  it('absorbs Back on dialogue, the ending and cards', () => {
    for (const s of ['dialogue', 'ending', 'card'] as ShellScreen[])
      expect(backAction(s, null)).toBe('none');
  });

  it('leaves loading to the browser', () => {
    expect(backAction('loading', null)).toBeNull();
  });
});

describe('backEnabled', () => {
  const off = { standalone: false, fullscreen: false, forced: false };

  it('is off in an ordinary tab', () => {
    expect(backEnabled(off)).toBe(false);
  });

  it('is on when installed, fullscreen or forced', () => {
    expect(backEnabled({ ...off, standalone: true })).toBe(true);
    expect(backEnabled({ ...off, fullscreen: true })).toBe(true);
    expect(backEnabled({ ...off, forced: true })).toBe(true);
  });
});

describe('pauseAction', () => {
  const SUBS = [
    'controls',
    'options',
    'saves',
    'sound',
    'haptics',
    'display',
    'touch',
    'touchEdit',
  ] as const;

  it('pauses in play, from the keyboard or the button', () => {
    expect(pauseAction('play', null, false)).toBe('pause');
    expect(pauseAction('play', null, true)).toBe('pause');
  });

  it('goes back one level from every screen over a menu on Esc, P or Start', () => {
    for (const screen of ['pause', 'title'] as const)
      for (const sub of SUBS) expect(pauseAction(screen, sub, false)).toBe('close');
  });

  it('leaves the whole menu from every screen over a menu on the Pause button', () => {
    for (const sub of SUBS) {
      expect(pauseAction('pause', sub, true)).toBe('leaveToGame');
      expect(pauseAction('title', sub, true)).toBe('leaveToTitle');
    }
  });

  it('resumes from the top of the pause menu either way, and does nothing on the title', () => {
    expect(pauseAction('pause', null, false)).toBe('resume');
    expect(pauseAction('pause', null, true)).toBe('resume');
    expect(pauseAction('title', null, true)).toBeNull();
    expect(pauseAction('title', null, false)).toBeNull();
  });

  it('skips scenes, and ignores the rest', () => {
    expect(pauseAction('cine', null, true)).toBe('skipCine');
    expect(pauseAction('credits', null, true)).toBe('skipEnding');
    expect(pauseAction('stinger', null, false)).toBe('skipEnding');
    for (const s of ['loading', 'card', 'dialogue', 'ending'] as const)
      expect(pauseAction(s, null, true)).toBeNull();
  });
});

/** A fake backend: the Esc rules need only what it says, not a browser. */
const fake = (isFullscreen: boolean, escapeCaptured: boolean) => ({
  isFullscreen: () => isFullscreen,
  escapeCaptured,
});
const OUT = fake(false, false);
const CAPTURED = fake(true, true);
const UNCAPTURED = fake(true, false);

describe('escAction', () => {
  const SUBS = [
    'controls',
    'options',
    'saves',
    'sound',
    'haptics',
    'display',
    'touch',
    'touchEdit',
  ] as const;
  const SCREENS: ShellScreen[] = [
    'title',
    'pause',
    'play',
    'cine',
    'credits',
    'stinger',
    'dialogue',
    'ending',
    'card',
    'loading',
  ];

  it('is the pause command outside fullscreen, on every screen and screen over one', () => {
    for (const screen of SCREENS) {
      expect(escAction(screen, null, OUT)).toBe(pauseAction(screen, null, false));
      for (const sub of SUBS)
        expect(escAction(screen, sub, OUT)).toBe(pauseAction(screen, sub, false));
    }
  });

  it('pauses in play, fullscreen or not', () => {
    expect(escAction('play', null, OUT)).toBe('pause');
    expect(escAction('play', null, CAPTURED)).toBe('pause');
  });

  it('resumes from the pause menu outside fullscreen, and does nothing on the title', () => {
    expect(escAction('pause', null, OUT)).toBe('resume');
    expect(escAction('title', null, OUT)).toBeNull();
  });

  it('leaves fullscreen from the top of the pause menu and the title, and keeps the menu open', () => {
    expect(escAction('pause', null, CAPTURED)).toBe('exitFullscreen');
    expect(escAction('title', null, CAPTURED)).toBe('exitFullscreen');
  });

  it('does not leave fullscreen when the page would not have seen the key', () => {
    // Fullscreen but no capture (Firefox, Safari): an Esc that arrives is ordinary.
    expect(escAction('pause', null, UNCAPTURED)).toBe('resume');
    expect(escAction('title', null, UNCAPTURED)).toBeNull();
    expect(escAction('play', null, UNCAPTURED)).toBe('pause');
    // Captured without fullscreen is nothing to leave.
    expect(escAction('pause', null, fake(false, true))).toBe('resume');
  });

  it('closes a screen over the pause menu or the title first, fullscreen or not', () => {
    for (const screen of ['pause', 'title'] as const)
      for (const sub of SUBS) {
        expect(escAction(screen, sub, CAPTURED)).toBe('close');
        expect(escAction(screen, sub, OUT)).toBe('close');
        expect(escAction(screen, sub, UNCAPTURED)).toBe('close');
      }
  });

  it('is unchanged in fullscreen on every other screen', () => {
    for (const screen of SCREENS.filter((s) => s !== 'pause' && s !== 'title')) {
      expect(escAction(screen, null, CAPTURED)).toBe(escAction(screen, null, OUT));
    }
    expect(escAction('cine', null, CAPTURED)).toBe('skipCine');
    expect(escAction('credits', null, CAPTURED)).toBe('skipEnding');
    expect(escAction('stinger', null, CAPTURED)).toBe('skipEnding');
    expect(escAction('card', null, CAPTURED)).toBeNull();
    expect(escAction('dialogue', null, CAPTURED)).toBeNull();
    expect(escAction('ending', null, CAPTURED)).toBeNull();
    expect(escAction('loading', null, CAPTURED)).toBeNull();
  });
});

describe('peekPlan', () => {
  it('peeks the pause menu onto the game', () => {
    expect(peekPlan('pause', null, null)).toEqual({ layer: 'overlay', parent: { game: true } });
  });

  it('has no peek on the title menu, where Back backgrounds the app', () => {
    expect(peekPlan('title', null, null)).toBeNull();
  });

  it('peeks a screen over the title or the pause menu onto the menu under it', () => {
    for (const screen of ['title', 'pause'] as const) {
      for (const sub of ['options', 'saves'] as const) {
        expect(peekPlan(screen, sub, null)).toEqual({
          layer: 'overlay',
          parent: { game: false, sub: null },
        });
      }
    }
  });

  it('peeks a nested Options screen onto the one under it', () => {
    for (const sub of ['sound', 'haptics', 'display', 'touch'] as const) {
      expect(peekPlan('pause', sub, 'options')).toEqual({
        layer: 'overlay',
        parent: { game: false, sub: 'options' },
      });
    }
  });

  it('draws the Controls table in the title itself', () => {
    expect(peekPlan('title', 'controls', null)).toEqual({
      layer: 'title',
      parent: { game: false, sub: null },
    });
  });

  it('has no peek for the touch editor or the story and play screens', () => {
    expect(peekPlan('title', 'touchEdit', 'touch')).toBeNull();
    expect(peekPlan('pause', 'touchEdit', 'touch')).toBeNull();
    const others: ShellScreen[] = [
      'play',
      'cine',
      'dialogue',
      'ending',
      'card',
      'credits',
      'stinger',
      'loading',
    ];
    for (const screen of others) expect(peekPlan(screen, null, null)).toBeNull();
  });
});
