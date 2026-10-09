// Browser check that the mouse cursor hides in play after a rest, and stays on the title.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

test('the cursor hides in play after the mouse rests, and shows on the title', async ({ page }) => {
  await page.goto('/?debug&level=0');
  const stage = page.locator('#stage');
  await page.mouse.move(300, 300);
  await expect(stage).toHaveAttribute('data-cursor', 'hidden', { timeout: 20_000 });
  await page.mouse.move(310, 310);
  await expect(stage).not.toHaveAttribute('data-cursor', 'hidden');
  await expect(stage).toHaveAttribute('data-cursor', 'hidden');

  await page.goto('/');
  await expect(page.locator('#title')).toBeVisible({ timeout: 20_000 });
  await page.mouse.move(300, 300);
  await page.waitForTimeout(1800);
  await expect(stage).not.toHaveAttribute('data-cursor', 'hidden');
});
