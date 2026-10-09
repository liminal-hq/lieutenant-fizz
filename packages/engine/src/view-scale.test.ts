// Tests for the view scale maths.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  MIN_TILES,
  PIXEL_BUDGET,
  frameView,
  sharpDivisor,
  sharpView,
  softRatio,
  type FrameView,
} from './view-scale';

describe('sharpView', () => {
  const cases: [number, number, number, number][] = [
    [1170, 13, 5, 14.625],
    [936, 13, 4, 14.625],
    [1080, 13, 5, 13.5],
    [720, 13, 3, 15],
    [780, 13, 3, 16.25],
    [768, 13, 3, 16],
    [416, 13, 2, 13],
    [2160, 13, 10, 13.5],
    [1440, 13, 6, 15],
    [4320, 13, 20, 13.5],
    [969, 13, 4, 969 / 64],
    [600, 13, 2, 18.75],
  ];
  it.each(cases)('H %i, target %i gives scale %i', (h, target, scale, tiles) => {
    const v = sharpView(h, target);
    expect(v?.scale).toBe(scale);
    expect(v?.tiles).toBeCloseTo(tiles, 9);
  });

  it('falls back below 11 tiles', () => {
    expect(sharpView(340, 13)).toBeNull();
    expect(sharpView(351, 13)).toBeNull();
    expect(sharpView(352, 13)?.tiles).toBe(11);
  });

  it('uses the map and cinematic targets', () => {
    expect(sharpView(1170, 12)).toEqual({ scale: 6, tiles: 1170 / 96 });
    expect(sharpView(1170, 14)).toEqual({ scale: 5, tiles: 14.625 });
    expect(sharpView(0, 13)).toBeNull();
  });

  it('keeps the invariants for every height', () => {
    for (const target of [12, 13, 14]) {
      for (let h = 352; h <= 4400; h += 1) {
        const v = sharpView(h, target);
        if (!v) continue;
        expect(Number.isInteger(v.scale)).toBe(true);
        expect(v.scale).toBeGreaterThanOrEqual(2);
        expect(v.tiles).toBeGreaterThanOrEqual(MIN_TILES);
        if (h >= 32 * target) expect(v.tiles).toBeGreaterThanOrEqual(target);
        if (h >= 32 * target)
          expect(v.tiles).toBeLessThan((target * (v.scale + 1)) / v.scale + 1e-9);
        expect(v.tiles * 16 * v.scale).toBeCloseTo(h, 6);
        expect(v.tiles).toBeLessThanOrEqual(22);
      }
    }
  });
});

describe('softRatio', () => {
  it('is the capped device ratio at common sizes', () => {
    expect(softRatio(1, 1280, 720)).toBe(1);
    expect(softRatio(1.5, 1920, 1080)).toBe(1.5);
    expect(softRatio(2, 1920, 1080)).toBe(2);
    expect(softRatio(3, 844, 390)).toBe(2);
    expect(softRatio(1, 3440, 1440)).toBe(1);
    expect(softRatio(1, 3840, 2160)).toBe(1);
    expect(softRatio(2, 1920, 1080)).toBe(2);
  });
  it('backs a desktop canvas at the full window size at a device ratio of 1', () => {
    for (const [w, h] of [
      [1280, 720],
      [2560, 1440],
    ] as const) {
      const r = softRatio(1, w, h);
      expect([Math.round(w * r), Math.round(h * r)]).toEqual([w, h]);
    }
  });
  it('is capped by the budget past UHD', () => {
    const r = softRatio(2, 2560, 1440 * 2);
    expect(r).toBeLessThan(2);
    expect(Math.floor(2560 * r) * Math.floor(2880 * r)).toBeLessThanOrEqual(PIXEL_BUDGET);
    expect(softRatio(1, 7680, 4320)).toBeCloseTo(0.5, 9);
  });
});

describe('sharpDivisor', () => {
  it('is 1 on phones and at UHD', () => {
    expect(sharpDivisor(2532, 1170, 3)).toBe(1);
    expect(sharpDivisor(1924, 936, 2.6)).toBe(1);
    expect(sharpDivisor(3840, 2160, 2)).toBe(1);
    expect(sharpDivisor(3440, 1440, 1)).toBe(1);
  });
  it('divides canvases over the budget', () => {
    expect(sharpDivisor(5120, 2880, 2)).toBe(2);
    expect(sharpDivisor(7680, 4320, 1)).toBe(2);
    expect(sharpDivisor(7680, 4320, 4)).toBe(2);
  });
  it('divides when the ratio is over the cap', () => {
    expect(sharpDivisor(3000, 1500, 4)).toBe(2);
    expect(sharpDivisor(3000, 1500, 3)).toBe(1);
  });
  it('gives up when the size is not divisible', () => {
    expect(sharpDivisor(5121, 2880, 2)).toBeNull();
    expect(sharpDivisor(0, 10, 1)).toBeNull();
  });
  it('keeps the canvas inside the budget', () => {
    for (const [w, h, d] of [
      [5120, 2880, 2],
      [6016, 3384, 2],
      [7680, 4320, 1],
      [3840, 2160, 2],
      [2532, 1170, 3],
    ] as const) {
      const k = sharpDivisor(w, h, d);
      if (k) expect((w / k) * (h / k)).toBeLessThanOrEqual(PIXEL_BUDGET);
    }
  });
});

describe('frameView', () => {
  const out = (): FrameView => ({ halfW: 0, halfH: 0, scale: 0 });
  const soft = (cssW: number, cssH: number): FrameView =>
    frameView(out(), {
      cssW,
      cssH,
      devW: cssW,
      devH: cssH,
      target: 13,
      zoom: 1,
      sharp: false,
    });

  it('leaves the Soft desktop view as it was', () => {
    for (const [w, h] of [
      [1280, 720],
      [2560, 1440],
      [3440, 1440],
      [3840, 2160],
    ] as const) {
      const v = soft(w, h);
      expect(v.halfH).toBe(6.5);
      expect(v.halfW).toBe((6.5 * w) / h);
      expect(v.scale).toBe(0);
    }
  });

  it('applies the zoom in Soft', () => {
    const v = frameView(out(), {
      cssW: 1280,
      cssH: 720,
      devW: 1280,
      devH: 720,
      target: 13,
      zoom: 2,
      sharp: true,
    });
    expect(v.halfH).toBe(3.25);
    expect(v.scale).toBe(0);
  });

  it('is Sharp on a phone', () => {
    const v = frameView(out(), {
      cssW: 844,
      cssH: 390,
      devW: 2532,
      devH: 1170,
      target: 13,
      zoom: 1,
      sharp: true,
    });
    expect(v.scale).toBe(5);
    expect(v.halfH * 2).toBeCloseTo(14.625, 9);
    expect(v.halfW).toBeCloseTo((v.halfH * 2532) / 1170, 9);
  });

  it('is Sharp at the phone sizes the browser checks run at, with a whole scale and no bars', () => {
    // The canvas backs onto device pixels, so its size is the CSS size times the device ratio.
    for (const [w, h, dpr, scale] of [
      [844, 390, 3, 5],
      [740, 360, 2.6, 4],
    ] as const) {
      const devW = Math.round(w * dpr);
      const devH = Math.round(h * dpr);
      const v = frameView(out(), {
        cssW: w,
        cssH: h,
        devW,
        devH,
        target: 13,
        zoom: 1,
        sharp: true,
      });
      expect(v.scale, `${w}×${h}`).toBe(scale);
      expect(v.halfH * 2).toBeCloseTo(14.625, 9);
      expect(v.halfH * 2 * 16 * v.scale).toBeCloseTo(devH, 6);
      expect(v.halfW).toBeCloseTo((v.halfH * devW) / devH, 9);
    }
  });

  it('falls back to Soft when the screen is too short', () => {
    const v = frameView(out(), {
      cssW: 400,
      cssH: 300,
      devW: 400,
      devH: 300,
      target: 13,
      zoom: 1,
      sharp: true,
    });
    expect(v.scale).toBe(0);
    expect(v.halfH).toBe(6.5);
  });

  it('reuses the object it is given', () => {
    const o = out();
    expect(
      frameView(o, { cssW: 1, cssH: 1, devW: 1, devH: 1, target: 13, zoom: 1, sharp: false }),
    ).toBe(o);
  });
});
