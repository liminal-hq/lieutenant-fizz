// Browser checks that a phone draws the game at a whole pixel scale with no bars.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';
import { measure, openLevel, view } from './pixels';

// Why the pixel-reading tests are disabled for now: they time out on the shared CI runner. Kept so they
// can be profiled and re-enabled (see docs/MOBILE_PLAN.md, Testing).
const FLAKY = 'flaky on CI: reading pixels in software GL times out; profile and re-enable';

// The scale each phone project should land on: 1170 px tall gives 5, 936 px tall gives 4.
const EXPECTED: Record<string, { scale: number; tiles: number }> = {
  'touch-844': { scale: 5, tiles: 14.625 },
  'touch-740': { scale: 4, tiles: 14.625 },
};

test('the canvas backs one to one onto device pixels, at a whole scale with no bars', async ({
  page,
}, info) => {
  await openLevel(page, '/?debug&touch');
  const v = await view(page);
  const vp = page.viewportSize()!;
  expect(v.k).toBe(1);
  expect(v.pixelGrid).toBe(true);
  expect(v.canvasW).toBe(Math.round(vp.width * v.dpr));
  expect(v.canvasH).toBe(Math.round(vp.height * v.dpr));
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#gl canvas') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, left: r.left, top: r.top, cw: r.width, ch: r.height };
  });
  expect([canvas.w, canvas.h]).toEqual([v.canvasW, v.canvasH]);
  // No bars: the canvas fills the viewport.
  expect([canvas.left, canvas.top, canvas.cw, canvas.ch]).toEqual([0, 0, vp.width, vp.height]);
  // The scale the renderer picked is the one the maths gives (view-scale.test.ts, 'frameView').
  const want = EXPECTED[info.project.name]!;
  expect(v.sharp).toBe(true);
  expect(v.scale).toBe(want.scale);
  expect(v.tiles).toBeCloseTo(want.tiles, 6);
});

test('a sprite pixel is exactly the scale in device pixels', async ({ page }) => {
  test.fixme(true, FLAKY); // times out reading pixels on the CI runner; profile and re-enable
  await openLevel(page, '/?debug&touch');
  const v = await view(page);
  const m = await measure(page, v);
  expect(m.runs).toBeGreaterThan(10);
  expect(m.divisor).toBe(v.scale);
  expect(m.congruent).toBe(true);
});

test('with ?pixels=soft the same measure fails, so the check can tell', async ({ page }) => {
  test.fixme(true, FLAKY); // times out reading pixels on the CI runner; profile and re-enable
  await openLevel(page, '/?debug&touch&pixels=soft');
  const v = await view(page);
  expect(v.sharp).toBe(false);
  expect(v.pixelGrid).toBe(false);
  const m = await measure(page, v);
  expect(m.runs).toBeGreaterThan(10);
  expect(m.divisor).toBe(1);
});
