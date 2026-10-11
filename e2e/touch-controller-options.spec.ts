// Browser checks for Options > Controller on a phone with a pad connected: full-height rows, and a tap or the Back button ends the wait for a button.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { ROW_MIN } from './density';

const row = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { has: page.locator('.lbl', { hasText: label }) });

const tapAt = async (sel: ReturnType<Page['locator']>, page: Page): Promise<void> => {
  const b = (await sel.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

/** Boots the title on a phone with a pad connected, then opens Options > Controller by touch. */
async function openController(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  await page.goto('/?debug&touch&title=split');
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  await tapAt(options, page);
  await expect(row(page, 'Controller')).toBeVisible();
  await tapAt(row(page, 'Controller'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Controller');
  return errors;
}

test('Options > Controller on touch: full-height rows that fit, and a tap on a row ends the wait', async ({
  page,
}) => {
  const errors = await openController(page);
  expect(await page.locator('#overlay .menu button .lbl').allInnerTexts()).toEqual([
    'Jump',
    'Pogo',
    'Fizz',
    'Pause',
    'Reset to defaults',
    'Back',
  ]);
  await expect(row(page, 'Jump').locator('.val')).toHaveText('A');
  await expect(row(page, 'Pogo').locator('.val')).toHaveText('B, Y');
  const heights = await page
    .locator('#overlay .menu button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(ROW_MIN);
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
    shortRows: [],
    selectedHidden: [],
    menuCrowds: [],
    cueCrowds: [],
  });
  // A tap on Jump waits for a button; a second tap anywhere on the rows gives up and stays here.
  await tapAt(row(page, 'Jump'), page);
  await expect(row(page, 'Jump').locator('.val')).toHaveText('Press buttons');
  await tapAt(row(page, 'Fizz'), page);
  await expect(row(page, 'Jump').locator('.val')).toHaveText('A');
  await expect(page.locator('#overlay h2')).toHaveText('Controller');
  expect(errors).toEqual([]);
});

test('the Back button ends the wait first and leaves the screen second', async ({ page }) => {
  const errors = await openController(page);
  await tapAt(row(page, 'Pogo'), page);
  await expect(row(page, 'Pogo').locator('.val')).toHaveText('Press buttons');
  await tapAt(page.locator('#backBtn'), page);
  await expect(row(page, 'Pogo').locator('.val')).toHaveText('B, Y');
  await expect(page.locator('#overlay h2')).toHaveText('Controller');
  await tapAt(page.locator('#backBtn'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  expect(errors).toEqual([]);
});
