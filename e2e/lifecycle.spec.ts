// Browser check that the lifecycle state is exposed. Headless fullscreen is unreliable, so it is not asserted.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

test('exposes the lifecycle state and boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&fullscreen=off');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  const life = await page.evaluate(
    () =>
      (window as unknown as { __lf: { debugState: { lifecycle: Record<string, unknown> } } }).__lf
        .debugState.lifecycle,
  );
  expect(life.host).toBe('web');
  expect(life.fullscreenWant).toBe('off');
  expect(life.lastFs).toBeNull();
  expect(errors).toEqual([]);
});
