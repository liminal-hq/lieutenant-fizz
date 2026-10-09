// Tests for the browser Back rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { backAction, backEnabled, pauseAction } from './back';
import type { ShellScreen } from './touch-menus';

describe('backAction', () => {
  it('leaves the title to the browser, and closes a screen over it', () => {
    expect(backAction('title', null)).toBeNull();
    for (const sub of ['controls', 'options', 'saves', 'sound', 'touch'] as const)
      expect(backAction('title', sub)).toBe('close');
  });

  it('resumes from the pause menu, and closes a screen over it', () => {
    expect(backAction('pause', null)).toBe('resume');
    for (const sub of ['controls', 'options', 'saves', 'sound', 'touch'] as const)
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
  const SUBS = ['controls', 'options', 'saves', 'sound', 'touch', 'touchEdit'] as const;

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
