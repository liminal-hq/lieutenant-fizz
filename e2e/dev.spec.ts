// Browser checks of the developer hooks that make a level reachable without a keyboard.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

type Lf = { debugShow(s: string): void; debugState: { screen: string; level: number } };

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
}

const state = (page: Page): Promise<{ screen: string; level: number }> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);

test('debugShow("play") starts level 0 on the play screen', async ({ page }) => {
  await ready(page, '/?debug');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
  expect((await state(page)).level).toBe(0);
});

test('?debug&level=N starts straight in that level', async ({ page }) => {
  await ready(page, '/?debug&level=1');
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
  expect((await state(page)).level).toBe(1);
});

test('an unknown level in the URL is ignored', async ({ page }) => {
  await ready(page, '/?debug&level=999');
  await page.waitForTimeout(500);
  expect((await state(page)).screen).not.toBe('play');
});

test('?touch pins touch mode on a desktop, and without it the desktop HUD shows', async ({
  page,
}) => {
  await ready(page, '/?debug&touch');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#hud.pills')).toBeVisible();
  await expect(page.locator('#panelBtn')).toBeHidden();
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#hud.pills')).toHaveCount(0);
  await expect(page.locator('#panelBtn')).toBeVisible();
});
