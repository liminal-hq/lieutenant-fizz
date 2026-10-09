// Browser checks of the sound lab: it exists only under ?debug, opens with ?debug&lab and keeps to the type rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

type Lf = { debugAudio(mode?: string): { mode: string } };

const mode = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugAudio().mode);

test('there is no sound lab without ?debug', async ({ page }) => {
  await page.goto('/?lab');
  await expect(page.locator('#title, #loading')).not.toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('#lab')).toHaveCount(0);
  await expect(page.locator('#labBtn')).toHaveCount(0);
});

test.describe('on a landscape phone window', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('?debug&lab opens the lab, whose buttons play, switch the mode and keep to the type rules', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?debug&lab');
    await expect(page.locator('#lab')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#labBtn')).toBeHidden();

    // Every control is a comfortable touch target.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#lab button, #lab input')]
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => e.getBoundingClientRect().height < 47.5)
        .map((e) => e.textContent || e.tagName),
    );
    expect(small).toEqual([]);

    // The type is whole multiples of Fizz's 11 px, and the page does not scroll.
    const { checked, badSize, pageOverflow } = await page.evaluate(audit, {});
    expect(checked).toBeGreaterThan(5);
    expect({ badSize, pageOverflow }).toEqual({ badSize: [], pageOverflow: [] });

    // A sound button plays without throwing, and the mode toggle switches live.
    await page.locator('#lab .lab-grid button', { hasText: /^jump$/ }).click();
    await page.locator('#lab button', { hasText: 'Classic' }).first().click();
    await expect.poll(() => mode(page)).toBe('classic');
    await page.locator('#lab button', { hasText: 'Enhanced' }).first().click();
    await expect.poll(() => mode(page)).toBe('enhanced');

    // The room and mix pickers, a slider and the reset leave the game running.
    await page.locator('#lab [role=tab]', { hasText: 'Rooms and mix' }).click();
    await page.locator('#lab button', { hasText: /^cave$/ }).click();
    await page.locator('#lab input[type=range]:visible').first().press('ArrowRight');
    await expect(page.locator('#lab button', { hasText: /changed/ })).toBeVisible();
    await page.locator('#lab button', { hasText: 'Reset to defaults' }).click();
    await expect(page.locator('#lab button', { hasText: 'Copy as JSON' })).toHaveText(
      /^Copy as JSON$/,
    );

    await page.keyboard.press('Escape');
    await expect(page.locator('#lab')).toBeHidden();
    await expect(page.locator('#labBtn')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
