// Tests for the Enhanced sound effects: every effect has a version, and each trick does what it says.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noteHz, type SfxVoice } from '@lieutenant-fizz/engine/audio';
import { describe, expect, it } from 'vitest';
import {
  CURVES,
  PARTIALS,
  curveVoices,
  enhanceEffect,
  enhanceSfx,
  partialRatio,
} from './enhanced-sfx';
import { SFX } from './patterns';

/** When a voice's sound ends, in seconds from the start of the effect. */
const endOf = (v: SfxVoice): number =>
  (v.nudge ?? 0) + (v.a ?? 0.001) + (v.d ?? 0.1) + (v.r ?? 0.05);
const length = (voices: readonly SfxVoice[]): number => Math.max(...voices.map(endOf));

describe('enhanceSfx', () => {
  const enhanced = enhanceSfx(SFX);

  it('has a version of every effect, with at least one voice', () => {
    expect(Object.keys(enhanced).sort()).toEqual(Object.keys(SFX).sort());
    for (const voices of Object.values(enhanced)) expect(voices.length).toBeGreaterThan(0);
  });

  it('does not change Classic', () => {
    const before = JSON.stringify(SFX);
    enhanceSfx(SFX);
    expect(JSON.stringify(SFX)).toBe(before);
  });

  it('keeps every voice within a quarter of the loudest Classic voice of its effect', () => {
    for (const [name, voices] of Object.entries(enhanced)) {
      const top = Math.max(...voices.map((v) => v.g));
      const classic = Math.max(...SFX[name]!.map((v) => v.g));
      expect(top, name).toBeLessThanOrEqual(classic * 1.25);
    }
  });

  it('ends each jingle when Classic does, so no bell rings past the end', () => {
    for (const name of Object.keys(PARTIALS)) {
      expect(length(enhanced[name]!) - length(SFX[name]!), name).toBeLessThan(0.02);
    }
  });
});

describe('pitch curves', () => {
  it('builds one short note every 25 ms, from the start pitch', () => {
    const rise = curveVoices({
      shape: 'rise',
      from: 'e4',
      semitones: 12,
      seconds: 0.1,
      wave: 'square',
      gain: 0.2,
    });
    expect(rise).toHaveLength(4);
    expect(rise[0]?.hz).toBeCloseTo(noteHz('e4'), 6);
    expect(rise[3]?.hz).toBeCloseTo(noteHz('e4') * 2, 6);
    rise.forEach((v, i) => expect(v.nudge).toBeCloseTo(i * 0.025, 9));
  });

  it('can fall, and can start late', () => {
    const fall = curveVoices({
      shape: 'fall',
      from: 'e5',
      semitones: 12,
      seconds: 0.1,
      wave: 'sine',
      gain: 0.1,
      start: 0.5,
    });
    expect(fall[3]?.hz).toBeCloseTo(noteHz('e5') / 2, 6);
    expect(fall[0]?.nudge).toBe(0.5);
  });

  it('is the same every time, jitter included', () => {
    for (const curve of Object.values(CURVES).flatMap((c) => c.add)) {
      expect(curveVoices(curve)).toEqual(curveVoices(curve));
    }
  });

  it('drops only the Classic voices a curve replaces', () => {
    const boing = enhanceEffect('boing', SFX['boing']!);
    expect(boing.some((v) => v.n === 'd5')).toBe(true);
    expect(boing.some((v) => v.n === 'g3' && !v.hz)).toBe(false);
    expect(boing.filter((v) => v.hz).length).toBeGreaterThan(10);
  });
});

describe('shaping', () => {
  it('opens the filter at each pitched voice and gives longer voices a sine partner', () => {
    const [main, partner] = enhanceEffect('clang', SFX['clang']!);
    expect(main).toMatchObject({ n: 'a5', lpa: 0.001, lps: 0.2 });
    expect(main!.lpenv).toBeCloseTo(main!.lpf! * 1.2, 6);
    expect(partner).toMatchObject({ n: 'a5', w: 'sine', nudge: 0.002 });
    expect(partner!.g).toBeCloseTo(SFX['clang']![0]!.g * 0.35, 6);
  });

  it('leaves noise and deep thumps as they were', () => {
    expect(enhanceEffect('poof', SFX['poof']!)).toEqual(SFX['poof']);
    const thoom = enhanceEffect('thoom', SFX['thoom']!);
    expect(thoom).toEqual(SFX['thoom']);
  });
});

describe('bell partials', () => {
  it('puts a short sine partner on each jingle, and never past the end', () => {
    for (const name of Object.keys(PARTIALS)) {
      const bells = enhanceEffect(name, SFX[name]!).filter(
        (v) => v.hz && v.w === 'sine' && v.r === 0.03,
      );
      expect(bells, name).toHaveLength(PARTIALS[name]!.length);
      for (const bell of bells) expect(bell.d).toBeLessThanOrEqual(0.12);
    }
  });

  it('keeps an inharmonic ratio on a sine voice and moves off a triangle voice own harmonics', () => {
    const sine = SFX['usb']![3]!;
    expect(sine.w).toBe('sine');
    expect(partialRatio(sine, 2.76)).toBe(2.76);
    const triangle = SFX['key']![2]!;
    expect(partialRatio(triangle, 2.76)).not.toBe(2.76);
    // At least one critical band from the nearest of the triangle's odd harmonics.
    const hz = noteHz(triangle.n);
    const partial = hz * partialRatio(triangle, 2.76);
    const nearest = Math.min(...[1, 3, 5, 7, 9].map((k) => Math.abs(k * hz - partial)));
    expect(nearest / Math.max(100, partial * 0.2)).toBeGreaterThanOrEqual(1);
  });
});
