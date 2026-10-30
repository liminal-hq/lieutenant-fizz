// Browser checks for the opening titles: the gate, the picture, skipping, and where they lead.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Lf {
  debugShow(s: string): void;
  debugTitlesAt(t: number): void;
  debugState: {
    screen: string;
    sub: string | null;
    titles: { gate: boolean; time: number; after: string } | null;
  };
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

const state = (page: Page): Promise<Lf['debugState']> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);

test.describe('the opening titles', () => {
  test('a page opened on its own waits at a gate, plays on a key and skips on another', async ({
    page,
  }) => {
    const errors = await open(page, '&titles=on');
    await expect.poll(async () => (await state(page)).titles?.gate).toBe(true);
    await expect(page.locator('#titles')).toBeVisible();
    await expect(page.locator('#loading')).toHaveText('Press any key to start');
    // The title menu is not behind a button the key could also press.
    expect((await state(page)).screen).toBe('title');

    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).titles?.gate).toBe(false);
    await expect(page.locator('#loading')).toBeHidden();
    await expect.poll(async () => (await state(page)).titles?.time ?? 0).toBeGreaterThan(0.3);

    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).titles).toBeNull();
    await expect(page.locator('#titles')).toBeHidden();
    expect((await state(page)).screen).toBe('title');
    expect((await state(page)).sub).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a launcher New game plays them, then the story', async ({ page }) => {
    const errors = await open(page, '&titles=on&host=fake-desktop&launch=new');
    // No gate: the launcher's tap has already let the sound play.
    await expect.poll(async () => (await state(page)).titles?.after).toBe('new');
    expect((await state(page)).titles?.gate).toBe(false);
    expect((await state(page)).screen).toBe('title');
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).screen).toBe('cine');
    expect((await state(page)).titles).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a launcher Continue or Load does not show them', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'lf-ep1-slot-1',
        JSON.stringify({
          v: 3,
          at: 1,
          progress: { lives: 3, score: 0, nextLife: 100, ammo: 0, doneMask: 1, played: 0 },
        }),
      );
    });
    const errors = await open(page, '&titles=on&host=fake-desktop&launch=load:1');
    await expect.poll(async () => (await state(page)).screen).toBe('play');
    expect((await state(page)).titles).toBeNull();
    await expect(page.locator('#titles')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('are off in a driven browser unless asked, and with ?titles=off', async ({ page }) => {
    await open(page, '');
    expect((await state(page)).titles).toBeNull();
    await expect(page.locator('#titles')).toBeHidden();
    await open(page, '&titles=off');
    expect((await state(page)).titles).toBeNull();
  });

  test('paint every moment of the sequence on a canvas that fills the stage', async ({ page }) => {
    const errors = await open(page, '&titles=off');
    for (const t of [0.5, 2.2, 3.7, 4.45, 5.2, 8.8, 12]) {
      await page.evaluate((x) => (window as unknown as { __lf: Lf }).__lf.debugTitlesAt(x), t);
      const box = await page.locator('#titles').boundingBox();
      const stage = await page.locator('#stage, body').first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(200);
      expect(box!.width).toBeLessThanOrEqual((stage?.width ?? 1e9) + 1);
    }
    expect(errors).toEqual([]);
  });

  test('keep the title menu behind them, which opens when they are skipped', async ({ page }) => {
    const errors = await open(page, '&titles=off');
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('titles'));
    await expect.poll(async () => (await state(page)).titles?.gate).toBe(false);
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).titles).toBeNull();
    await expect(page.locator('#title .menu button').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
