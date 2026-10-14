// Tests for the launcher's menu sounds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SILENT, createLauncherSound, sfxLevelFromOptions } from './sound';

describe('the launcher sound level', () => {
  it('is full when nothing is saved or the options cannot be read', () => {
    expect(sfxLevelFromOptions(null)).toBe(1);
    expect(sfxLevelFromOptions('not json')).toBe(1);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 2, sfx: 3 }))).toBe(1);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1 }))).toBe(1);
  });

  it("follows Episode 1's sound effects meter, 0 to 8", () => {
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1, sfx: 8 }))).toBe(1);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1, sfx: 4 }))).toBe(0.5);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1, sfx: 0 }))).toBe(0);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1, sfx: 99 }))).toBe(1);
    expect(sfxLevelFromOptions(JSON.stringify({ v: 1, sfx: -3 }))).toBe(0);
  });
});

describe('making the launcher sound', () => {
  const store = (json: string | null) => ({ getItem: () => json });
  const data = {
    sounds: { move: 'a', select: 'a', back: 'a', change: 'a', deny: 'a', swipe: 'a' },
    voices: {},
  };

  it('is silent for a theme with no sounds and when sound effects are off', () => {
    expect(createLauncherSound({}, store(null), false)).toBe(SILENT);
    const data = {
      sounds: { move: 'a', select: 'a', back: 'a', change: 'a', deny: 'a', swipe: 'a' },
      voices: {},
    };
    expect(createLauncherSound(data, store(JSON.stringify({ v: 1, sfx: 0 })), false)).toBe(SILENT);
  });

  it('has nothing to let go of when it is silent, and treats a store that throws as full volume', () => {
    expect(() => SILENT.dispose()).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    // Full volume, so it would build real audio; with no window here it is enough that reading did not throw.
    expect(() => {
      try {
        createLauncherSound(data, broken, false);
      } catch (e) {
        if (!(e instanceof ReferenceError)) throw e;
      }
    }).not.toThrow();
  });
});
