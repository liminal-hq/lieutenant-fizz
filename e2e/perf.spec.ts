// Browser check of the frame-time statistics under ?debug: they fill in, make sense, and reset.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Perf {
  frames: number;
  window: number;
  p50: number;
  p95: number;
  p99: number;
  long: number;
  max: number;
}

const perf = (page: Page): Promise<Perf | null> =>
  page.evaluate(
    () =>
      (window as unknown as { __lf: { debugState: { perf: Perf | null } } }).__lf.debugState.perf,
  );

test('debugState.perf reports plausible frame times and resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&fullscreen=off');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });

  // Software GL can be slow, so only the shape of the numbers is checked, never a frame rate.
  await expect
    .poll(async () => (await perf(page))?.window ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(10);
  const p = (await perf(page))!;
  expect(p.frames).toBeGreaterThanOrEqual(p.window);
  expect(p.p50).toBeGreaterThan(0);
  expect(p.p50).toBeLessThanOrEqual(p.p95);
  expect(p.p95).toBeLessThanOrEqual(p.p99);
  expect(p.p99).toBeLessThanOrEqual(p.max);
  expect(p.long).toBeGreaterThanOrEqual(0);
  expect(p.long).toBeLessThanOrEqual(p.window);

  const before = p.frames;
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugPerfReset(): void } }).__lf.debugPerfReset(),
  );
  const after = (await perf(page))!;
  expect(after.frames).toBeLessThan(before);
  await expect
    .poll(async () => (await perf(page))?.window ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(2);

  expect(errors).toEqual([]);
});
