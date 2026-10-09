// Browser checks for Options > Haptics on a desktop: no row without a vibrator or pad, and a pad that can rumble adds the row and a Rumble stepper.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil } from './keys';

const OPTIONS = 'lf-ep1-options-v1';

interface Win {
  __rumble: { effects: { strongMagnitude: number }[]; resets: number };
}

/** Whether the row with the selection is called `label`; runs in the page. */
const selected = (label: string): boolean =>
  document.querySelector('#overlay .menu button.sel .lbl')?.textContent === label;

const labels = (page: Page): Promise<string[]> =>
  page.locator('#overlay .menu button .lbl').allInnerTexts();

async function boot(page: Page, withPad: boolean): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (withPad)
    await page.addInitScript(() => {
      const rumble = { effects: [] as unknown[], resets: 0 };
      const pad = {
        index: 0,
        id: 'Fake pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
        vibrationActuator: {
          playEffect: (_t: string, p: unknown) => {
            rumble.effects.push(p);
            return Promise.resolve('complete');
          },
          reset: () => {
            rumble.resets++;
            return Promise.resolve('complete');
          },
        },
      };
      Object.assign(window, { __rumble: rumble });
      navigator.getGamepads = () => [pad as unknown as Gamepad];
    });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

test('a desktop without a vibrator or a pad has no Haptics row in Options', async ({ page }) => {
  const errors = await boot(page, false);
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('options'),
  );
  expect(await labels(page)).toEqual([
    'Sound',
    'Captions',
    'Controls',
    'Text size',
    'Motion',
    'Back',
  ]);
  expect(errors).toEqual([]);
});

test('a pad that can rumble adds the Haptics row, whose Rumble row steps and rumbles the pad', async ({
  page,
}) => {
  const errors = await boot(page, true);
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('options'),
  );
  await expect.poll(() => labels(page)).toContain('Haptics');
  await expect(
    page.locator('#overlay .menu button', { hasText: 'Haptics' }).locator('.val'),
  ).toHaveText('Strong');
  // Down to Haptics, Enter opens the screen: Strength, Rumble, Haptics lab (fixed by ?debug), Reset, Back.
  await pressUntil(page, 'ArrowDown', selected, 'Haptics');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Haptics');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Haptics',
  );
  await expect(page.locator('#overlay h2')).toHaveText('Haptics');
  expect(await labels(page)).toEqual(['Strength', 'Rumble', 'Haptics lab', 'Reset', 'Back']);
  // ?debug puts the haptics lab on, so that row is fixed and Down skips it.
  await expect(
    page.locator('#overlay .menu button', { hasText: 'Haptics lab' }).locator('.val'),
  ).toHaveText('On (link)');
  // Rumble: one step down is Medium, saved, and the pad rumbles with a bonk at 0.75.
  await pressUntil(page, 'ArrowDown', selected, 'Rumble');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Rumble');
  await pressUntil(
    page,
    'ArrowLeft',
    (k) => JSON.parse(localStorage.getItem(k) ?? '{}').rumble === 2,
    OPTIONS,
  );
  await expect(
    page.locator('#overlay .menu button', { hasText: 'Rumble' }).locator('.val'),
  ).toContainText('Medium');
  await expect
    .poll(async () =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').rumble, OPTIONS),
    )
    .toBe(2);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Win).__rumble.effects.length))
    .toBeGreaterThan(0);
  // Down skips the fixed Haptics lab row and lands on Reset; Escape returns to Haptics on Options.
  await pressUntil(page, 'ArrowDown', selected, 'Reset');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Reset');
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay h2')?.textContent === 'Options',
  );
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Haptics');
  expect(errors).toEqual([]);
});
