// Tests for the scene's size, parallax and slide.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  GROUND_SECONDS,
  MIN_SCROLL_SPEED,
  SCENE_FPS,
  scrollSteps,
  MAX_SCENE_SCALE,
  parallax,
  sceneScale,
  scrollSeconds,
  slideEase,
} from './scene';

describe('the scene scale', () => {
  it('is a whole number that fits its share of the window height', () => {
    expect(sceneScale(390, 192)).toBe(1);
    expect(sceneScale(720, 192)).toBe(2);
    expect(sceneScale(1080, 192)).toBe(3);
    for (const h of [300, 390, 540, 720, 900, 1920]) {
      const s = sceneScale(h, 192);
      expect(Number.isInteger(s)).toBe(true);
      expect(192 * s).toBeLessThanOrEqual(Math.max(192, h * 0.55));
    }
  });

  it('is never under 1 or over the most', () => {
    expect(sceneScale(100, 192)).toBe(1);
    expect(sceneScale(10000, 192)).toBe(MAX_SCENE_SCALE);
    expect(sceneScale(500, 0)).toBe(1);
  });
});

describe('the slide between scenes', () => {
  it('eases from 0 to 1, fast then settling, and stays inside that range', () => {
    expect(slideEase(0)).toBe(0);
    expect(slideEase(1)).toBe(1);
    expect(slideEase(0.5)).toBeGreaterThan(0.5);
    expect(slideEase(-3)).toBe(0);
    expect(slideEase(7)).toBe(1);
  });

  it('moves a near layer further than a far one, and a still layer a little', () => {
    expect(parallax(1)).toBe(1);
    expect(parallax(0)).toBeCloseTo(0.4);
    expect(parallax(0.3)).toBeLessThan(parallax(0.55));
    expect(parallax(9)).toBe(1);
  });
});

describe('the scrolling', () => {
  it('takes longer the slower the layer is, and a still layer does not scroll', () => {
    expect(scrollSeconds(1)).toBe(GROUND_SECONDS);
    expect(scrollSeconds(0.5)).toBe(GROUND_SECONDS * 2);
    expect(scrollSeconds(0)).toBeUndefined();
  });

  it('takes one step on the shared grid every sixtieth of a second, and at least one', () => {
    expect(SCENE_FPS).toBe(60);
    expect(scrollSteps(26)).toBe(1560);
    expect(scrollSteps(0.01)).toBe(1);
    // Layers of different speeds all step on the same grid, so the page makes one frame for them all.
    for (const seconds of [26, 52, 87, 216]) expect((seconds * SCENE_FPS) % 1).toBe(0);
  });

  it('leaves a layer that would take over four minutes a tile standing still, so it costs nothing', () => {
    expect(scrollSeconds(0.05)).toBeUndefined();
    expect(scrollSeconds(MIN_SCROLL_SPEED)).toBe(GROUND_SECONDS / MIN_SCROLL_SPEED);
  });
});
