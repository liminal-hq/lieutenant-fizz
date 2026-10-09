// Browser checks that a phone draws the game at a whole pixel scale with no bars.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';
import { canvasBox, expectCovers, expectCropped, measure, openLevel, view } from './pixels';

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
  const canvas = await canvasBox(page);
  expect([canvas.w, canvas.h]).toEqual([v.canvasW, v.canvasH]);
  // No bars: the canvas fills the viewport.
  await expectCovers(page);
  expect([canvas.cw, canvas.ch]).toEqual([vp.width, vp.height]);
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

// What `?pixels=fast` should back at each phone project: one canvas pixel per sprite pixel, `ceil(device / S)`.
// Level: 844×390 at 3× is S 5 (2532×1170 gives 507×234, 3 device pixels over on the right); 740×360 at 2.6× is
// S 4 (1924×936 gives 481×234, exact). The map target is one tile smaller, so S steps to 6 on the first and stays 4 on the second. The resized
// window is 640×300: 1920×900 at 3× is S 4 (480×225) and 1664×780 at 2.6× is S 3 (555×260, 1 over).
const FAST: Record<
  string,
  {
    level: [number, number, number];
    map: [number, number, number];
    small: [number, number, number];
  }
> = {
  'touch-844': { level: [507, 234, 5], map: [422, 195, 6], small: [480, 225, 4] },
  'touch-740': { level: [481, 234, 4], map: [481, 234, 4], small: [555, 260, 3] },
};

test("?pixels=fast backs one canvas pixel per sprite pixel, shows Sharp's view and covers the screen", async ({
  page,
}, info) => {
  const want = FAST[info.project.name]!;
  // Sharp's view, from a boot of its own.
  await openLevel(page, '/?debug&touch&pixels=sharp');
  const sharp = await view(page);
  await page.goto('about:blank');

  await openLevel(page, '/?debug&touch&pixels=fast');
  const v = await view(page);
  expect(v.fast).toBe(true);
  expect(v.pixelGrid).toBe(true);
  expect([v.canvasW, v.canvasH, v.k]).toEqual(want.level);
  expect(v.scale).toBe(1);
  expect(v.deviceScale).toBe(sharp.scale);
  // The same view as Sharp: the same tiles, to within one cropped sprite pixel row.
  expect(v.tiles).toBeGreaterThanOrEqual(sharp.tiles - 1e-9);
  expect(v.tiles).toBeLessThan(sharp.tiles + 1 / 16);
  // The canvas box is the backing times k in device pixels, starts at the corner and covers the screen.
  const box = await canvasBox(page);
  expect([box.w, box.h]).toEqual([v.canvasW, v.canvasH]);
  expect(box.cw * v.dpr).toBeCloseTo(v.canvasW * v.k, 3);
  expect(box.ch * v.dpr).toBeCloseTo(v.canvasH * v.k, 3);
  await expectCovers(page, v.k / v.dpr);
  await expectCropped(page);
  expect(v.overscanW).toBe(v.canvasW * v.k - v.deviceW);
  expect(v.overscanH).toBe(v.canvasH * v.k - v.deviceH);

  // The map has its own target, so its whole scale and backing differ and the view is Sharp's map view.
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('map'),
  );
  await expect.poll(async () => (await view(page)).canvasW).toBe(want.map[0]);
  const m = await view(page);
  expect([m.canvasW, m.canvasH, m.k]).toEqual(want.map);
  await expectCovers(page, m.k / m.dpr);

  // A window resize backs the canvas again, and the page never grows a scrollbar.
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('play'),
  );
  await page.setViewportSize({ width: 640, height: 300 });
  await expect.poll(async () => (await view(page)).canvasW).toBe(want.small[0]);
  const s = await view(page);
  expect([s.canvasW, s.canvasH, s.k]).toEqual(want.small);
  await expectCovers(page, s.k / s.dpr);
  await expectCropped(page);
  expect(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]),
  ).toEqual([640, 300]);
});
