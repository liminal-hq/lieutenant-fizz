// Browser check that a phone never takes the Esc lock: it has no Esc to keep.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

test('entering fullscreen on a phone does not ask for the keyboard lock', async ({ page }) => {
  await page.addInitScript(() => {
    const calls = { lock: 0, unlock: 0 };
    (window as unknown as { __kb: typeof calls }).__kb = calls;
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: {
        lock: () => (calls.lock++, Promise.resolve()),
        unlock: () => void calls.unlock++,
      },
    });
  });
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  const b = (await page.locator('#fsBtn').boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await page.evaluate(() => (window as unknown as { __kb: unknown }).__kb)).toEqual({
    lock: 0,
    unlock: 0,
  });
});
