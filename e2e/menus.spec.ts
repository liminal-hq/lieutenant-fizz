// Browser checks that the menus respond to the keyboard.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil, settle } from './keys';

type Lf = { debugShow(s: string): void };

async function open(page: Page, screen: string): Promise<void> {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await page.waitForTimeout(300);
}

for (const [label, key] of [
  ['Enter', 'Enter'],
  ['Escape', 'Escape'],
] as const) {
  test(`${label} goes back from the Controls screen to the title menu`, async ({ page }) => {
    await open(page, 'title');
    // Open Controls the way a player does: ArrowUp wraps to the last row, then Enter.
    await pressUntil(
      page,
      'ArrowUp',
      () => document.querySelector('#title > .menu button.sel .lbl')?.textContent === 'Controls',
    );
    await pressUntil(
      page,
      'Enter',
      () => !document.querySelector<HTMLElement>('#controls')?.hidden,
    );
    await expect(page.locator('#controls')).toBeVisible();
    await pressUntil(page, key, () => !!document.querySelector<HTMLElement>('#controls')?.hidden);
    await expect(page.locator('#controls')).toBeHidden();
    await expect(page.locator('#title > .menu')).toBeVisible();
    // The selection returns to the Controls row that opened it.
    await expect(page.locator('#title > .menu button.sel .lbl')).toHaveText('Controls');
  });
}

test('the Back button stays hidden on a desktop, over Controls, Options, Sound and Saves', async ({
  page,
}) => {
  await open(page, 'title');
  for (const screen of ['controls', 'options', 'sound', 'saves']) {
    await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
    await page.waitForTimeout(150);
    await expect(page.locator('#backBtn')).toBeHidden();
  }
});

test('a held arrow key repeats down the Options rows', async ({ page }) => {
  await open(page, 'options');
  const menu = (): Promise<number> =>
    page.evaluate(
      () => (window as unknown as { __lf: { debugState: { menu: number } } }).__lf.debugState.menu,
    );
  expect(await menu()).toBe(0);
  // The browser's own key repeat is ignored: the game repeats a held direction itself, after 350 ms.
  await settle(page);
  await page.keyboard.down('ArrowDown');
  await expect.poll(menu).toBeGreaterThanOrEqual(1);
  // Wait for the repeats by what they do, not by the clock: a slow frame rate delays every one of them.
  await expect.poll(menu, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await page.keyboard.up('ArrowDown');
});

test('Escape goes back from the Options screen', async ({ page }) => {
  await open(page, 'options');
  await expect(page.locator('#overlay')).toBeVisible();
  await pressUntil(page, 'Escape', () => !!document.querySelector<HTMLElement>('#overlay')?.hidden);
  await expect(page.locator('#overlay')).toBeHidden();
});

test('a desktop Options screen has no Touch controls row', async ({ page }) => {
  await open(page, 'options');
  const labels = await page.locator('#overlay .menu button .lbl').allInnerTexts();
  expect(labels).not.toContain('Touch controls');
  expect(labels).toEqual(['Sound', 'Captions', 'Controls', 'Text size', 'Motion', 'Back']);
});
