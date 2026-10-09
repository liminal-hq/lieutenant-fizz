// Browser checks of the haptics lab: it is there only under ?debug or the option, shares the Lab button with the sound lab, plays through the vibrator and keeps to the layout rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

interface Win {
  __vib: unknown[];
  __lf: { debugState: { screen: string } };
}

/** Boots with a `navigator.vibrate` that records what it is given. */
async function boot(
  page: Page,
  url: string,
  stored: Record<string, string> = {},
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((items) => {
    const calls: unknown[] = [];
    (window as unknown as Win).__vib = calls;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (p: unknown) => {
        calls.push(p);
        return true;
      },
    });
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, stored);
  await page.goto(url);
  return errors;
}

const vib = (page: Page): Promise<unknown[]> =>
  page.evaluate(() => [...(window as unknown as Win).__vib]);

test('there is no lab without ?debug or an option', async ({ page }) => {
  await boot(page, '/?lab=haptics');
  await expect(page.locator('#title, #loading')).not.toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('#lab')).toHaveCount(0);
  await expect(page.locator('#labBtn')).toHaveCount(0);
});

test.describe('on a landscape phone window', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the Haptics lab option shows the Lab button, which opens a lab that plays, tunes and keeps to the layout rules', async ({
    page,
  }) => {
    const errors = await boot(page, '/', {
      'lf-ep1-options-v1': JSON.stringify({ v: 1, hapticsLab: true }),
    });
    await expect(page.locator('#labBtn')).toBeVisible({ timeout: 20_000 });
    await page.locator('#labBtn').click();
    await expect(page.locator('#lab')).toBeVisible();
    await expect(page.locator('#lab .lab-head > b')).toHaveText('Haptics lab');
    // Only the haptics lab is wanted, so there is no Sound | Haptics switch.
    await expect(page.locator('#lab .lab-switch')).toBeHidden();
    await expect(page.locator('#labBtn')).toBeHidden();

    // Every control is a comfortable touch target, the type is Fizz's whole sizes and nothing scrolls the page.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#lab button, #lab input, #lab select')]
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => e.getBoundingClientRect().height < 47.5)
        .map((e) => e.textContent || e.tagName),
    );
    expect(small).toEqual([]);
    const { checked, badSize, pageOverflow, clipped } = await page.evaluate(audit, {});
    expect(checked).toBeGreaterThan(5);
    expect({ badSize, pageOverflow, clipped }).toEqual({
      badSize: [],
      pageOverflow: [],
      clipped: [],
    });

    // The same holds on the smaller 740×360 window, where the panel scrolls under the tabs.
    await page.setViewportSize({ width: 740, height: 360 });
    const small740 = await page.evaluate(audit, {});
    expect({
      badSize: small740.badSize,
      pageOverflow: small740.pageOverflow,
      clipped: small740.clipped,
    }).toEqual({ badSize: [], pageOverflow: [], clipped: [] });
    await page.setViewportSize({ width: 844, height: 390 });

    // A cue button plays through the vibrator (jump compiles to [15] at the lab's strength of 1).
    await page.locator('#lab .lab-cues button', { hasText: /^jump/ }).click();
    await expect.poll(() => vib(page)).toContainEqual([15]);

    // Editing a cue on the Tune tab is counted for Copy as JSON, and Reset puts it back.
    await page.locator('#lab [role=tab]', { hasText: 'Tune' }).click();
    await page.locator('#lab input[type=range]:visible').nth(2).press('ArrowRight');
    await expect(page.locator('#lab button', { hasText: /changed/ })).toBeVisible();
    await page.locator('#lab button', { hasText: 'Reset to defaults' }).click();
    await expect(page.locator('#lab button', { hasText: 'Copy as JSON' })).toHaveText(
      /^Copy as JSON$/,
    );

    await page.keyboard.press('Escape', { delay: 300 });
    await expect(page.locator('#lab')).toHaveCount(0);
    await expect(page.locator('#labBtn')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('?debug&lab=haptics opens the haptics lab, the header switches to the sound lab, and Escape closes without pausing', async ({
    page,
  }) => {
    const errors = await boot(page, '/?debug&lab=haptics&level=0');
    await expect(page.locator('#lab .lab-head > b')).toHaveText('Haptics lab', { timeout: 20_000 });
    await expect(page.locator('#labBtn')).toBeHidden();
    await page.locator('#lab .lab-switch button', { hasText: 'Sound' }).click();
    await expect(page.locator('#lab .lab-head > b')).toHaveText('Sound lab');
    await expect(page.locator('#lab')).toHaveCount(1);
    await page.locator('#lab .lab-switch button', { hasText: 'Haptics' }).click();
    await expect(page.locator('#lab .lab-head > b')).toHaveText('Haptics lab');
    expect(await page.evaluate(() => (window as unknown as Win).__lf.debugState.screen)).toBe(
      'play',
    );
    await page.keyboard.press('Escape', { delay: 300 });
    await expect(page.locator('#lab')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Win).__lf.debugState.screen)).toBe(
      'play',
    );
    expect(errors).toEqual([]);
  });
});
