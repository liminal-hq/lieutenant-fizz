// Browser checks for Options > Display on a phone: the row opens the screen, a tap steps a row, and the Back button returns to Display.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

const OPTIONS = 'lf-ep1-options-v1';

const row = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { has: page.locator('.lbl', { hasText: label }) });

const tapAt = async (sel: ReturnType<Page['locator']>, page: Page): Promise<void> => {
  const b = (await sel.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

test('Options > Display on touch: a tap steps Fullscreen and is saved, nothing crowds the controls, and Back returns to Display', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&touch&title=split');
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  await tapAt(options, page);
  await tapAt(row(page, 'Display'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Display');
  expect(await page.locator('#overlay .menu button .lbl').allInnerTexts()).toEqual([
    'Fullscreen',
    'Keep screen on',
    'Back',
  ]);
  await expect(row(page, 'Fullscreen').locator('.val')).toHaveText('Auto');
  const heights = await page
    .locator('#overlay .menu button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(47.9);
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
  });
  // The right stepper moves Auto to On; the saved choice follows.
  await tapAt(row(page, 'Fullscreen').locator('[data-step="1"]'), page);
  await expect(row(page, 'Fullscreen').locator('.val')).toHaveText('On');
  await expect
    .poll(() =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').fullscreen, OPTIONS),
    )
    .toBe(1);
  // Tapping the Keep screen on row turns it Off.
  await tapAt(row(page, 'Keep screen on'), page);
  await expect(row(page, 'Keep screen on').locator('.val')).toHaveText('Off');
  // Back lands on the Display row of Options, whose value follows.
  await tapAt(page.locator('#backBtn'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Display');
  await expect(row(page, 'Display').locator('.val')).toHaveText('On');
  expect(errors).toEqual([]);
});
