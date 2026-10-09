// Browser checks for Options > Sound on a desktop: the keyboard steps Style, the mode and storage follow, and Back lands on Sound.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { pressUntil } from './keys';

const KEY = 'lf-ep1-options-v1';

interface Lf {
  debugShow(s: string): void;
  debugAudio(): { mode: string; forced: boolean };
  debugState: { screen: string; sub: string | null; menu: number };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

const labels = (page: Page): Promise<string[]> =>
  page.locator('#overlay .menu button .lbl').allInnerTexts();

/** The Style value without the arrows a selected choice row wraps it in. */
const styleValue = async (page: Page): Promise<string> =>
  (await page.locator('#overlay .menu button', { hasText: 'Style' }).locator('.val').innerText())
    .replace(/[◄►]/g, '')
    .trim();

const stored = (page: Page): Promise<Record<string, unknown> | null> =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);

test('Options > Sound: Left and Enter change the style, which is saved, and Escape returns to the Sound row', async ({
  page,
}) => {
  const errors = await boot(page, '');
  await lf(page, (g) => g.debugShow('options'));
  expect(await labels(page)).toEqual([
    'Sound',
    'Display',
    'Captions',
    'Controls',
    'Text size',
    'Motion',
    'Back',
  ]);
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Sound');
  // Enter opens the Sound screen.
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Sound',
  );
  await expect(page.locator('#overlay h2')).toHaveText('Sound');
  expect(await labels(page)).toEqual(['Style', 'Music', 'Effects', 'Sound lab', 'Reset', 'Back']);
  // Auto resolves to the game's default.
  expect(await styleValue(page)).toBe('Enhanced');
  expect((await lf(page, (g) => g.debugAudio())).mode).toBe('enhanced');
  expect((await stored(page))?.['audio']).toBe(0);
  // Left steps to Classic and saves the choice.
  await pressUntil(page, 'ArrowLeft', () =>
    [...document.querySelectorAll('#overlay .menu button')].some(
      (b) =>
        b.textContent?.includes('Style') &&
        b.querySelector('.val')?.textContent?.includes('Classic'),
    ),
  );
  await expect.poll(() => styleValue(page)).toBe('Classic');
  await expect.poll(() => lf(page, (g) => g.debugAudio().mode)).toBe('classic');
  expect(await stored(page)).toMatchObject({ v: 1, audio: 1, music: 8, sfx: 8 });
  // Enter on the row goes round to Enhanced.
  await pressUntil(
    page,
    'Enter',
    () => (window as unknown as { __lf: Lf }).__lf.debugAudio().mode === 'enhanced',
  );
  await expect.poll(() => lf(page, (g) => g.debugAudio().mode)).toBe('enhanced');
  expect(await stored(page)).toMatchObject({ audio: 2 });
  // Music and Effects moved here: Down, then Left lowers the meter and saves the level.
  await pressUntil(
    page,
    'ArrowDown',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.menu === 1,
  );
  await pressUntil(
    page,
    'ArrowLeft',
    (k) => JSON.parse(localStorage.getItem(k) ?? '{}').music === 7,
    KEY,
  );
  await expect.poll(async () => (await stored(page))?.['music']).toBe(7);
  const { checked, ...problems } = await page.evaluate(audit, {});
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems)).toMatchObject({ pageOverflow: [], clipped: [] });
  // Escape goes back to Options with the selection on Sound.
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay h2')?.textContent === 'Options',
  );
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Sound');
  expect(errors).toEqual([]);
});

test('?audio= wins over the saved style, fixes Style and writes nothing', async ({ page }) => {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k!, v!),
    [KEY, JSON.stringify({ v: 1, audio: 2 })],
  );
  await boot(page, '&audio=classic');
  await lf(page, (g) => g.debugShow('sound'));
  await expect(page.locator('#overlay h2')).toHaveText('Sound');
  expect(await lf(page, (g) => g.debugAudio())).toMatchObject({ mode: 'classic', forced: true });
  expect(await styleValue(page)).toBe('Classic (link)');
  // The screen opens on Music, since Style cannot change; Left lowers Music and leaves Style alone.
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Music');
  await pressUntil(
    page,
    'ArrowLeft',
    (k) => JSON.parse(localStorage.getItem(k) ?? '{}').music === 7,
    KEY,
  );
  await expect.poll(async () => (await stored(page))?.['music']).toBe(7);
  expect((await stored(page))?.['audio']).toBe(2);
  expect((await lf(page, (g) => g.debugAudio())).mode).toBe('classic');
});

test('Options > Sound: the Sound lab row is Off by default, and On it shows the Lab button without ?debug, closing it when turned Off', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#labBtn, #lab')).toHaveCount(0);
  await options.click();
  await page.locator('#overlay .menu button', { hasText: 'Sound' }).click();
  await expect(page.locator('#overlay h2')).toHaveText('Sound');
  const lab = page.locator('#overlay .menu button', { hasText: 'Sound lab' });
  await expect(lab.locator('.val')).toHaveText('Off');
  expect((await stored(page))?.['lab']).not.toBe(true);
  // On: the button appears at once, and the setting is saved.
  await lab.click();
  await expect(lab.locator('.val')).toContainText('On');
  await expect(page.locator('#labBtn')).toBeVisible();
  expect(await stored(page)).toMatchObject({ v: 1, lab: true });
  // Open the lab, then switch the row Off from the keyboard: the lab closes and leaves the page.
  await page.locator('#labBtn').click();
  await expect(page.locator('#lab')).toBeVisible();
  await pressUntil(page, 'Escape', () => !document.querySelector('#lab:not([hidden])'));
  await expect(page.locator('#lab')).toBeHidden();
  await pressUntil(page, 'ArrowLeft', () => !document.querySelector('#labBtn, #lab'));
  await expect(page.locator('#labBtn, #lab')).toHaveCount(0);
  expect(await stored(page)).toMatchObject({ lab: false });
  expect(errors).toEqual([]);
});

test('?debug shows the Lab button whatever the Sound lab option says', async ({ page }) => {
  await boot(page, '');
  await expect(page.locator('#labBtn')).toBeVisible({ timeout: 20_000 });
  expect((await stored(page))?.['lab']).not.toBe(true);
});
