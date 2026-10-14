// Browser checks for the launch contract: what `?launch=` does inside the app (the fake desktop host) and nowhere else.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Lf {
  debugShow(s: string): void;
  debugState: { screen: string };
}

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

const screen = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.screen);

test.describe('the launch contract', () => {
  test('a new game from the launcher skips the title screen', async ({ page }) => {
    const errors = await open(page, '&host=fake-desktop&launch=new');
    await expect.poll(() => screen(page)).not.toBe('title');
    expect(errors).toEqual([]);
  });

  test('the launch is taken out of the address once read, so a reload opens the title screen', async ({
    page,
  }) => {
    const errors = await open(page, '&host=fake-desktop&launch=new');
    await expect.poll(() => screen(page)).not.toBe('title');
    expect(new URL(page.url()).searchParams.has('launch')).toBe(false);
    expect(new URL(page.url()).searchParams.has('debug')).toBe(true);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
      timeout: 20_000,
    });
    await page.waitForTimeout(400);
    expect(await screen(page)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('the pause menu of a launched run says Back to launcher and has no Quit to title', async ({
    page,
  }) => {
    const errors = await open(page, '&host=fake-desktop&launch=new');
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
    await expect(page.locator('#overlay .menu button').first()).toBeVisible();
    const rows = (await page.locator('#overlay .menu button').allInnerTexts()).map((t) => t.trim());
    expect(rows).toContain('Back to launcher');
    expect(rows).not.toContain('Quit to title');
    expect(rows).not.toContain('Quit to launcher');
    expect(errors).toEqual([]);
  });

  test('the pause menu of a game opened on its own keeps Quit to title', async ({ page }) => {
    await open(page, '&host=fake-desktop');
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
    await expect(page.locator('#overlay .menu button').first()).toBeVisible();
    const rows = (await page.locator('#overlay .menu button').allInnerTexts()).map((t) => t.trim());
    expect(rows).toContain('Quit to title');
    expect(rows).toContain('Quit to launcher');
  });

  test('Continue and Load with no save leave the title screen up, with a message', async ({
    page,
  }) => {
    for (const launch of ['continue', 'load:auto', 'load:2']) {
      const errors = await open(page, `&host=fake-desktop&launch=${launch}`);
      await page.waitForTimeout(400);
      expect(await screen(page), launch).toBe('title');
      expect(errors).toEqual([]);
    }
  });

  test('outside the app the parameter is ignored, so the website opens the title screen', async ({
    page,
  }) => {
    const errors = await open(page, '&launch=new');
    await page.waitForTimeout(400);
    expect(await screen(page)).toBe('title');
    expect(errors).toEqual([]);
  });
});
