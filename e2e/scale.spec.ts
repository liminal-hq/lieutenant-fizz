// Browser checks that desktop is unchanged and that a UHD canvas can still go Sharp.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';
import { canvasBox, expectCovers, expectCropped, measure, openLevel, view } from './pixels';

// The Soft view at 1280×720 is checked in the browser. That a 2560×1440 canvas backs at the window size
// with 13 tiles is proved by the unit tests in view-scale.test.ts ('frameView' and 'softRatio').
test('desktop at 1280x720 stays Soft with 13 tiles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLevel(page, '/?debug');
  const v = await view(page);
  expect(v.sharp).toBe(false);
  expect(v.scale).toBe(0);
  expect(v.tiles).toBe(13);
  expect(v.dpr).toBe(1);
  expect([v.canvasW, v.canvasH]).toEqual([1280, 720]);
  expect(v.budgeted).toBe(false);
});

// Fast at 1280×720 backs 427×240 (S 3, one device pixel over on the right) and shows Sharp's 15 tiles; a
// window of 1366×768 re-backs it to 456×256 (S 3, two over). About 0.1 MP, so it is cheap in software GL.
test('?pixels=fast on desktop backs one canvas pixel per sprite pixel and follows the window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLevel(page, '/?debug&pixels=fast');
  const v = await view(page);
  expect(v.fast).toBe(true);
  expect([v.canvasW, v.canvasH, v.k, v.scale, v.deviceScale]).toEqual([427, 240, 3, 1, 3]);
  expect([v.overscanW, v.overscanH]).toEqual([1, 0]);
  expect(v.tiles).toBe(15);
  const box = await canvasBox(page);
  expect([box.w, box.h]).toEqual([427, 240]);
  expect([box.cw, box.ch]).toEqual([1281, 720]);
  await expectCovers(page, 3);
  await expectCropped(page);

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(async () => (await view(page)).canvasW).toBe(456);
  const w = await view(page);
  expect([w.canvasH, w.k, w.overscanW, w.overscanH]).toEqual([256, 3, 2, 0]);
  // The canvas re-backs on the resize, the view on the next frame, so wait for the frame as well.
  await expect.poll(async () => (await view(page)).tiles).toBe(16);
  await expectCovers(page, 3);
});

// A 3840 x 2160 canvas: about 7 s in software GL on a quiet machine, but over two minutes on a loaded
// CI runner. Disabled for now and kept, to be profiled and re-enabled; set LF_E2E_UHD=1 to run it locally.
// The UHD scale maths is covered by the unit tests in view-scale.test.ts.
test.describe('UHD', () => {
  test.fixme(
    !process.env['LF_E2E_UHD'],
    'flaky on CI: a 4K canvas in software GL; profile and re-enable',
  );
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });

  test('?pixels=sharp at 3840x2160 is scale 10 with 13.5 tiles', async ({ page }) => {
    test.slow();
    await openLevel(page, '/?debug&pixels=sharp');
    const v = await view(page);
    expect([v.canvasW, v.canvasH]).toEqual([3840, 2160]);
    expect(v.k).toBe(1);
    expect(v.scale).toBe(10);
    expect(v.tiles).toBe(13.5);
    const m = await measure(page, v);
    expect(m.divisor).toBe(10);
    expect(m.congruent).toBe(true);
  });
});
