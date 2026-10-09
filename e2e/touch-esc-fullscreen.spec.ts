// Browser check that a phone never takes the Esc lock: it has no Esc to keep.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect as baseExpect, test } from '@playwright/test';

// Going fullscreen leaves the page drawing at the full screen size under software GL, so a poll can take seconds on a
// shared CI runner; the default 5 s expect timeout is too short, and the test is slow.
const expect = baseExpect.configure({ timeout: 20_000 });

test('entering fullscreen on a phone does not ask for the keyboard lock', async ({ page }) => {
  test.slow();
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
  await page.locator('#fsBtn').tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await page.evaluate(() => (window as unknown as { __kb: unknown }).__kb)).toEqual({
    lock: 0,
    unlock: 0,
  });
});
