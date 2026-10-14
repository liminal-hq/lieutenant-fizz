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

  it('is silent for a theme with no sounds and when sound effects are off', () => {
    expect(createLauncherSound({}, store(null), false)).toBe(SILENT);
    const data = {
      sounds: { move: 'a', select: 'a', back: 'a', change: 'a', deny: 'a', swipe: 'a' },
      voices: {},
    };
    expect(createLauncherSound(data, store(JSON.stringify({ v: 1, sfx: 0 })), false)).toBe(SILENT);
  });
});
