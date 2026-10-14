// Tests for the launcher's menu sounds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SILENT, createLauncherSound } from './sound';

const data = {
  sounds: { move: 'a', select: 'a', back: 'a', change: 'a', deny: 'a', swipe: 'a' },
  voices: {},
};

describe('making the launcher sound', () => {
  it('is silent for a theme with no sounds, and when the effects volume is off', () => {
    expect(createLauncherSound({}, 1, false)).toBe(SILENT);
    expect(createLauncherSound({ sounds: data.sounds }, 1, false)).toBe(SILENT);
    expect(createLauncherSound(data, 0, false)).toBe(SILENT);
  });

  it('has nothing to let go of when it is silent', () => {
    expect(() => SILENT.dispose()).not.toThrow();
    expect(() => SILENT.cue('move')).not.toThrow();
  });
});
