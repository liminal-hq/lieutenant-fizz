// Tests for the sound-field maths: placement, pan law and the make-up gain.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  AUDIO_DEFAULT,
  FIELD,
  PANNED_MAKEUP,
  panGains,
  parseAudioParam,
  placeSound,
  resolveAudioMode,
} from './sound-field';

const CAM = { x: 50, y: 10 };
const HALF = { w: 10, h: 6.5 };

describe('placeSound', () => {
  // Camera (50, 10), half-view 10 x 6.5.
  const cases: [string, number, number, number, number][] = [
    ["Ben's jump", 50.4, 9, 0.024, 1],
    ['an enemy on screen', 57, 11, 0.42, 1],
    ['half a screen off to the right', 65, 10, 0.6, 0.75],
    ['far left and below', 28, 0, -0.6, 0.4],
    ['directly overhead and off screen', 50, 20, 0, 0.731],
  ];
  it.each(cases)('%s', (_name, x, y, pan, gain) => {
    const at = placeSound(x, y, CAM, HALF);
    expect(at.pan).toBeCloseTo(pan, 3);
    expect(at.gain).toBeCloseTo(gain, 3);
  });

  it('puts the camera centre dead centre at full level', () => {
    expect(placeSound(50, 10, CAM, HALF)).toEqual({ pan: 0, gain: 1 });
  });

  it('clamps the pan to the width, either side, however far away', () => {
    expect(placeSound(1e6, 10, CAM, HALF).pan).toBe(FIELD.width);
    expect(placeSound(-1e6, 10, CAM, HALF).pan).toBe(-FIELD.width);
  });

  it('never goes below the floor, so far sounds are quiet but not lost', () => {
    expect(placeSound(1e6, 1e6, CAM, HALF).gain).toBe(FIELD.floor);
    expect(FIELD.floor).toBeGreaterThan(0);
  });

  it('keeps full level out to the screen edge and fades past it', () => {
    expect(placeSound(60, 10, CAM, HALF).gain).toBe(1);
    expect(placeSound(60.5, 10, CAM, HALF).gain).toBeLessThan(1);
  });

  it('measures distance on the further axis', () => {
    // 1.5 half-screens away vertically (9.75) and none sideways.
    expect(placeSound(50, 10 + 9.75, CAM, HALF).gain).toBeCloseTo(0.75, 6);
    expect(placeSound(50, 10 - 9.75, CAM, HALF).gain).toBeCloseTo(0.75, 6);
  });

  it('follows a different tuning and a different view', () => {
    const wide = { width: 1, near: 0.5, slope: 1, floor: 0.1 };
    const at = placeSound(55, 10, CAM, { w: 5, h: 5 }, wide);
    expect(at.pan).toBe(1);
    expect(at.gain).toBeCloseTo(0.5, 6);
  });
});

describe('panGains', () => {
  it('is equal power across the whole range', () => {
    for (let p = -1; p <= 1.0001; p += 0.1) {
      const { l, r } = panGains(p);
      expect(l * l + r * r).toBeCloseTo(1, 12);
    }
  });

  it('is the StereoPanner mono law', () => {
    expect(panGains(-1)).toEqual({ l: 1, r: expect.closeTo(0, 12) });
    expect(panGains(0).l).toBeCloseTo(Math.SQRT1_2, 12);
    expect(panGains(0).r).toBeCloseTo(Math.SQRT1_2, 12);
    expect(panGains(1).l).toBeCloseTo(0, 12);
    expect(panGains(1).r).toBeCloseTo(1, 12);
  });

  it('clamps out-of-range pans', () => {
    expect(panGains(5)).toEqual(panGains(1));
    expect(panGains(-5)).toEqual(panGains(-1));
  });
});

describe('PANNED_MAKEUP', () => {
  it('restores the centre to the level of an unpanned mono voice (L = R = 1)', () => {
    const { l, r } = panGains(0);
    expect(l * PANNED_MAKEUP).toBeCloseTo(1, 12);
    expect(r * PANNED_MAKEUP).toBeCloseTo(1, 12);
  });

  it('keeps the same total power at any pan, as the worked example at 0.6 shows', () => {
    const { l, r } = panGains(0.6);
    expect(l * PANNED_MAKEUP).toBeCloseTo(0.437, 3);
    expect(r * PANNED_MAKEUP).toBeCloseTo(1.345, 3);
    // Two channels at unity is a power of 2; the make-up keeps every pan there.
    for (const p of [-0.6, -0.2, 0, 0.3, 0.6]) {
      const g = panGains(p);
      expect((g.l * PANNED_MAKEUP) ** 2 + (g.r * PANNED_MAKEUP) ** 2).toBeCloseTo(2, 12);
    }
  });
});

describe('the default audio mode', () => {
  it('is Enhanced', () => {
    expect(AUDIO_DEFAULT).toBe('enhanced');
    expect(resolveAudioMode(undefined)).toBe('enhanced');
  });

  it('lets an explicit choice win, so ?audio=classic forces Classic', () => {
    expect(resolveAudioMode(parseAudioParam('classic'))).toBe('classic');
    expect(resolveAudioMode(parseAudioParam('enhanced'))).toBe('enhanced');
  });

  it('treats a missing or unknown ?audio= value as no choice', () => {
    for (const v of [null, undefined, '', 'Classic', 'loud', 'enhanced ']) {
      expect(parseAudioParam(v)).toBeUndefined();
      expect(resolveAudioMode(parseAudioParam(v))).toBe(AUDIO_DEFAULT);
    }
  });
});
