// Browser check that the map's level panel is unchanged on desktop: centred above the bottom, never docked.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

test('the map panel stays centred on desktop', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
  // Ben at Crater Fields, where the map shows its level panel.
  await page.evaluate(() => {
    const g = (
      window as unknown as {
        __lf: { debugShow(s: string): void; sim: { set(i: number, v: number): void } };
      }
    ).__lf;
    g.debugShow('map');
    g.sim.set(13, 14);
    g.sim.set(14, 6);
  });
  const card = page.locator('#prompt');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('data-dock', /.*/);
  const box = await card.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return {
      mid: r.x + r.width / 2,
      bottom: window.innerHeight - r.bottom,
      align: getComputedStyle(e).textAlign,
    };
  });
  const view = page.viewportSize()!;
  expect(Math.abs(box.mid - view.width / 2)).toBeLessThan(1);
  expect(box.bottom).toBeCloseTo(28, 0);
  expect(box.align).toBe('center');
});
