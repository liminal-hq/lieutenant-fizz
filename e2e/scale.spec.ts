// Browser checks that desktop is unchanged and that a UHD canvas can still go Sharp.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';
import { measure, openLevel, view } from './pixels';

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
