// Tests for what the launcher does for the desktop app.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { fullscreenKey, shouldStartFullscreen } from './desktop';

const session = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('starting fullscreen', () => {
  it('happens on the desktop app when the choice is On, once for each run of the app', () => {
    const s = session();
    const start = { kind: 'tauri-desktop' as const, fullscreen: 1, session: s };
    expect(shouldStartFullscreen(start)).toBe(true);
    // Coming back from a game: the player may have left fullscreen, so it is not asked for again.
    expect(shouldStartFullscreen(start)).toBe(false);
    // A new run of the app has a new session.
    expect(shouldStartFullscreen({ ...start, session: session() })).toBe(true);
  });

  it('never happens for Auto or Off, or off the desktop app', () => {
    for (const choice of [0, 2]) {
      expect(
        shouldStartFullscreen({
          kind: 'tauri-desktop',
          fullscreen: choice,
          session: session(),
        }),
      ).toBe(false);
    }
    for (const kind of ['web', 'tauri-android', 'tauri-ios'] as const) {
      expect(shouldStartFullscreen({ kind, fullscreen: 1, session: session() })).toBe(false);
    }
  });

  it('asks every time when there is no session storage to remember in', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldStartFullscreen({ kind: 'tauri-desktop', fullscreen: 1, session: broken })).toBe(
      true,
    );
  });
});

describe('the fullscreen keys', () => {
  it('toggles on F11 and F, but not with a modifier or while held', () => {
    expect(fullscreenKey({ key: 'F11', code: 'F11' }, false, false)).toBe('toggle');
    expect(fullscreenKey({ key: 'f' }, true, true)).toBe('toggle');
    expect(fullscreenKey({ key: 'F', shiftKey: false }, false, false)).toBe('toggle');
    expect(fullscreenKey({ key: 'f', ctrlKey: true }, false, false)).toBeUndefined();
    expect(fullscreenKey({ key: 'f', metaKey: true }, false, false)).toBeUndefined();
    expect(fullscreenKey({ key: 'F11', repeat: true }, false, false)).toBeUndefined();
  });

  it('leaves fullscreen on Esc at the home screen only, and lets Esc go back elsewhere', () => {
    expect(fullscreenKey({ key: 'Escape' }, true, false)).toBe('exit');
    expect(fullscreenKey({ key: 'Escape' }, false, false)).toBeUndefined();
    expect(fullscreenKey({ key: 'Escape' }, true, true)).toBeUndefined();
  });
});
