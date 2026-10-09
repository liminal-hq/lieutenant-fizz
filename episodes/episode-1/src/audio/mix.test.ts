// Tests for Episode 1's mix states: every screen and sub-screen has one, and the numbers are the design's.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { ShellScreen, SubScreen } from '../touch-menus';
import { MIX, mixFor, mixNameFor } from './mix';

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
const SUBS: SubScreen[] = [null, 'controls', 'options', 'saves'];

const OPEN = { lpf: 20000, gain: 1 };

describe('mixFor', () => {
  it('answers for every screen with every sub-screen', () => {
    for (const s of SCREENS) {
      for (const sub of SUBS) {
        const m = mixFor(s, sub);
        expect(m.lpf).toBeGreaterThan(0);
        expect(m.gain).toBeGreaterThan(0);
        expect(m.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('muffles Pause and every screen opened from it', () => {
    for (const sub of SUBS) {
      expect(mixFor('pause', sub)).toEqual({ lpf: 900, gain: 0.7 });
      expect(mixFor('pause', sub, true)).toEqual({ lpf: 1400, gain: 0.7 });
    }
  });

  it('keeps the Sound screen open, even over Pause, so the music can be judged', () => {
    expect(mixFor('pause', 'sound')).toEqual(OPEN);
    expect(mixFor('pause', 'sound', true)).toEqual(OPEN);
    expect(mixFor('title', 'sound')).toEqual(OPEN);
    // Options itself, one level up, is still muffled over Pause.
    expect(mixFor('pause', 'options')).toEqual({ lpf: 900, gain: 0.7 });
  });

  it('leaves the title, its sub-screens, play and the credits open', () => {
    for (const s of ['loading', 'title', 'play', 'credits', 'stinger'] as const) {
      for (const sub of SUBS) expect(mixFor(s, sub)).toEqual(OPEN);
    }
  });

  it('mutes the cards lightly, and ducks speech and the cinematics without muffling them', () => {
    expect(mixFor('card', null)).toEqual({ lpf: 2200, gain: 0.8 });
    expect(mixFor('dialogue', null)).toEqual({ lpf: 20000, gain: 0.7 });
    expect(mixFor('cine', null)).toEqual({ lpf: 20000, gain: 0.85 });
    expect(mixFor('ending', null)).toEqual({ lpf: 20000, gain: 0.85 });
    expect(20 * Math.log10(0.85)).toBeCloseTo(-1.4, 1);
  });

  it('returns a copy, and reads the live states so a tune takes effect', () => {
    mixFor('pause', null).lpf = 1;
    expect(MIX.pause.lpf).toBe(900);
    MIX.pause.lpf = 700;
    try {
      expect(mixFor('pause', null).lpf).toBe(700);
    } finally {
      MIX.pause.lpf = 900;
    }
  });
});

describe('mixNameFor', () => {
  it('names the state mixFor reads, for every screen', () => {
    for (const s of SCREENS) {
      for (const coarse of [false, true]) {
        expect(mixFor(s, null, coarse)).toEqual(MIX[mixNameFor(s, coarse)]);
      }
    }
    expect(mixNameFor('pause', true)).toBe('pauseCoarse');
    expect(mixNameFor('play')).toBe('open');
  });
});
