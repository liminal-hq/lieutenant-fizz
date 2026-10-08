// Tests for the browser Back rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { backAction, backEnabled } from './back';
import type { ShellScreen } from './touch-menus';

describe('backAction', () => {
  it('leaves the title to the browser, and closes a screen over it', () => {
    expect(backAction('title', null)).toBeNull();
    for (const sub of ['controls', 'options', 'saves'] as const)
      expect(backAction('title', sub)).toBe('close');
  });

  it('resumes from the pause menu, and closes a screen over it', () => {
    expect(backAction('pause', null)).toBe('resume');
    for (const sub of ['controls', 'options', 'saves'] as const)
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
