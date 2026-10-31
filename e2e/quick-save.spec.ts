// Browser checks that F5 and F9 use a quick-save slot of their own and never touch the manual slots.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil } from './keys';

const SLOT_1 = {
  v: 3,
  at: Date.UTC(2026, 9, 7, 16),
  progress: {
    lives: 3,
    score: 12340,
    nextLife: 12400,
    ammo: 5,
    doneMask: 0b10111,
    played: 5400,
    map: { x: 12.4, y: 29 },
  },
};

/** Opens a launched run that has loaded Slot 1, so F5 and F9 are live on the map. */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((save) => {
    if (!localStorage.getItem('lf-ep1-slot-1')) {
      localStorage.setItem('lf-ep1-slot-1', JSON.stringify(save));
    }
  }, SLOT_1);
  await page.goto('/?debug&host=fake-desktop&launch=load:1');
  await page.waitForFunction(
    () =>
      (window as unknown as { __lf?: { debugState: { screen: string } } }).__lf?.debugState
        .screen === 'play',
    null,
    { timeout: 20_000 },
  );
  return errors;
}

const read = (page: Page, key: string): Promise<string | null> =>
  page.evaluate((k) => localStorage.getItem(k), key);

test.describe('quick-save', () => {
  test('F9 with no quick-save says so and loads nothing', async ({ page }) => {
    const errors = await open(page);
    await pressUntil(
      page,
      'F9',
      () => !!document.querySelector('#toast')?.textContent?.includes('No quick-save'),
    );
    await expect(page.locator('#toast')).toContainText('No quick-save yet: F5 makes one');
    expect(await read(page, 'lf-ep1-quick')).toBeNull();
    expect(errors).toEqual([]);
  });

  test('F5 writes the quick slot and leaves the manual slot as it was', async ({ page }) => {
    const errors = await open(page);
    const before = await read(page, 'lf-ep1-slot-1');
    await pressUntil(page, 'F5', () => localStorage.getItem('lf-ep1-quick') !== null);
    await expect(page.locator('#toast')).toContainText('Quick-saved');
    expect(await read(page, 'lf-ep1-slot-1')).toBe(before);
    const quick = JSON.parse((await read(page, 'lf-ep1-quick')) ?? 'null') as { v: number } | null;
    expect(quick?.v).toBe(3);
    expect(errors).toEqual([]);
  });

  test('F9 loads the quick-save', async ({ page }) => {
    const errors = await open(page);
    await pressUntil(page, 'F5', () => localStorage.getItem('lf-ep1-quick') !== null);
    await pressUntil(
      page,
      'F9',
      () => !!document.querySelector('#toast')?.textContent?.includes('Loaded Quick save'),
    );
    await expect(page.locator('#toast')).toContainText('Loaded Quick save');
    expect(errors).toEqual([]);
  });

  test('the Load screen lists the quick-save and the Save screen does not', async ({ page }) => {
    const errors = await open(page);
    await pressUntil(page, 'F5', () => localStorage.getItem('lf-ep1-quick') !== null);
    const rows = async (open: RegExp): Promise<string[]> => {
      await page.evaluate(() =>
        (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('pause'),
      );
      await page.locator('#overlay .menu button', { hasText: open }).click();
      await expect(page.locator('#overlay .menu button', { hasText: 'Back' })).toBeVisible();
      const texts = (await page.locator('#overlay .menu button').allInnerTexts()).map((t) =>
        t.trim(),
      );
      await page.locator('#overlay .menu button', { hasText: 'Back' }).click();
      return texts;
    };
    expect((await rows(/Load game/)).join('\n')).toContain('Quick save');
    expect((await rows(/Save game/)).join('\n')).not.toContain('Quick save');
    expect(errors).toEqual([]);
  });
});
