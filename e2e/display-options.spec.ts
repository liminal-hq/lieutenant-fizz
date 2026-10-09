// Browser checks for Options > Display on a desktop: the keyboard steps Fullscreen and Keep screen on, the settings are saved and used, and a link fixes a row.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil } from './keys';

const KEY = 'lf-ep1-options-v1';

interface Lf {
  debugShow(s: string): void;
  debugState: {
    screen: string;
    sub: string | null;
    menu: number;
    lifecycle: { fullscreenWant: string; wakeWant: string };
  };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

async function boot(page: Page, query: string, saved?: Record<string, unknown>): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (saved) {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k!, v!),
      [KEY, JSON.stringify({ v: 1, ...saved })],
    );
  }
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

const labels = (page: Page): Promise<string[]> =>
  page.locator('#overlay .menu button .lbl').allInnerTexts();

/** A row's value without the arrows a selected choice row wraps it in. */
const valueOf = async (page: Page, label: string): Promise<string> =>
  (await page.locator('#overlay .menu button', { hasText: label }).locator('.val').innerText())
    .replace(/[◄►]/g, '')
    .trim();

const stored = (page: Page): Promise<Record<string, unknown> | null> =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);

test('Options > Display: the keyboard steps Fullscreen and Keep screen on, both are saved and used, and Escape returns to the Display row', async ({
  page,
}) => {
  const errors = await boot(page, '');
  await lf(page, (g) => g.debugShow('options'));
  // Display sits in Options after Sound (no Haptics row on a desktop), and shows Fullscreen's setting.
  expect((await labels(page)).slice(0, 2)).toEqual(['Sound', 'Display']);
  await pressUntil(
    page,
    'ArrowDown',
    () => document.querySelector('#overlay .menu button.sel .lbl')?.textContent === 'Display',
  );
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Display',
  );
  // Row spacing only sets the touch menus' rows, so a desktop page does not show it.
  expect(await labels(page)).toEqual(['Fullscreen', 'Keep screen on', 'Back']);
  await expect(page.locator('#overlay .menu button', { hasText: 'Row spacing' })).toHaveCount(0);
  expect(await valueOf(page, 'Fullscreen')).toBe('Auto');
  expect(await valueOf(page, 'Keep screen on')).toBe('On');
  expect(await lf(page, (g) => g.debugState.lifecycle)).toMatchObject({
    fullscreenWant: 'auto',
    wakeWant: 'on',
  });
  // Left from Auto goes round to Off, which is saved and used.
  await pressUntil(page, 'ArrowLeft', () =>
    [...document.querySelectorAll('#overlay .menu button')].some(
      (b) =>
        b.textContent?.includes('Fullscreen') &&
        b.querySelector('.val')?.textContent?.includes('Off'),
    ),
  );
  await expect.poll(async () => (await stored(page))?.['fullscreen']).toBe(2);
  await expect.poll(() => lf(page, (g) => g.debugState.lifecycle.fullscreenWant)).toBe('off');
  // Enter on Keep screen on turns it Off.
  await pressUntil(
    page,
    'ArrowDown',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.menu === 1,
  );
  await pressUntil(
    page,
    'Enter',
    () => JSON.parse(localStorage.getItem('lf-ep1-options-v1') ?? '{}').awake === false,
  );
  await expect.poll(() => lf(page, (g) => g.debugState.lifecycle.wakeWant)).toBe('off');
  expect(await valueOf(page, 'Keep screen on')).toBe('Off');
  expect(await stored(page)).toMatchObject({ v: 1, fullscreen: 2, awake: false });
  // Escape goes back to Options with the selection on Display, whose value follows.
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay h2')?.textContent === 'Options',
  );
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Display');
  expect(await valueOf(page, 'Display')).toBe('Off');
  expect(errors).toEqual([]);
});

test('the saved settings are used on the next visit, and a link wins over them without writing', async ({
  page,
}) => {
  const errors = await boot(page, '&fullscreen&wake=off', { fullscreen: 2, awake: true });
  expect(await lf(page, (g) => g.debugState.lifecycle)).toMatchObject({
    fullscreenWant: 'on',
    wakeWant: 'off',
  });
  await lf(page, (g) => g.debugShow('display'));
  await expect(page.locator('#overlay h2')).toHaveText('Display');
  expect(await valueOf(page, 'Fullscreen')).toBe('On (link)');
  expect(await valueOf(page, 'Keep screen on')).toBe('Off (link)');
  await expect(page.locator('#overlay .menu button.dis')).toHaveCount(2);
  // Both rows are fixed, so the screen opens on Back.
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Back');
  // The saved choices are still there for when the link is gone.
  expect(await stored(page)).toMatchObject({ v: 1, fullscreen: 2, awake: true });
  expect(errors).toEqual([]);
});

test('a saved Off for Fullscreen and Keep screen on is used at boot', async ({ page }) => {
  const errors = await boot(page, '', { fullscreen: 2, awake: false });
  expect(await lf(page, (g) => g.debugState.lifecycle)).toMatchObject({
    fullscreenWant: 'off',
    wakeWant: 'off',
  });
  await lf(page, (g) => g.debugShow('display'));
  expect(await valueOf(page, 'Fullscreen')).toBe('Off');
  expect(await valueOf(page, 'Keep screen on')).toBe('Off');
  await expect(page.locator('#overlay .menu button.dis')).toHaveCount(0);
  expect(errors).toEqual([]);
});
