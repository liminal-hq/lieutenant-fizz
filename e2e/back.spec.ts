// Browser checks that the browser's Back button is the game's in fullscreen or installed mode (forced with `?back`).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

type BackState = { enabled: boolean; armed: boolean };
type State = { screen: string; sub: string | null; back: BackState };

const state = (page: Page): Promise<State> =>
  page.evaluate(() => (window as unknown as { __lf: { debugState: State } }).__lf.debugState);

const screen = async (page: Page): Promise<string> => (await state(page)).screen;
const sub = async (page: Page): Promise<string | null> => (await state(page)).sub;
const armed = async (page: Page): Promise<boolean> => (await state(page)).back.armed;
const historyLength = (page: Page): Promise<number> => page.evaluate(() => history.length);

/**
 * Loads the game from `about:blank` (so Back from the title has somewhere to go that is not the game),
 * then clicks the page once: Chromium skips history entries added before the page has had a gesture.
 */
async function open(page: Page, query: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await expect.poll(() => screen(page)).toBe('title');
  await page.mouse.click(5, 5);
}

/** A title menu row, by its label. */
const row = (page: Page, label: string) =>
  page.locator('#title > .menu button', { hasText: label });

/** Starts a new game from the title and skips the opening, ending on the map (the play screen). */
async function startPlaying(page: Page): Promise<void> {
  await row(page, 'New game').click();
  await expect.poll(() => screen(page)).toBe('cine');
  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('play');
}

test('Back pauses in play, and Back again resumes', async ({ page }) => {
  await open(page, '&back');
  await startPlaying(page);
  await expect.poll(() => armed(page)).toBe(true);
  await page.goBack();
  await expect.poll(() => screen(page)).toBe('pause');
  await page.goBack();
  await expect.poll(() => screen(page)).toBe('play');
  // Still held after each answer, so the next Back is answered as well.
  await expect.poll(() => armed(page)).toBe(true);
});

test('Back closes the Options screen and stays on the title', async ({ page }) => {
  await open(page, '&back');
  await row(page, 'Options').click();
  await expect.poll(() => sub(page)).toBe('options');
  await expect.poll(() => armed(page)).toBe(true);
  await page.goBack();
  await expect.poll(() => sub(page)).toBeNull();
  expect(await screen(page)).toBe('title');
  expect(page.url()).toContain('/?debug&back');
  // On the title with nothing over it the guard lets go.
  await expect.poll(() => armed(page)).toBe(false);
});

test('Back from the title leaves the page', async ({ page }) => {
  await open(page, '&back');
  expect(await armed(page)).toBe(false);
  await page.goBack();
  await expect.poll(() => page.url()).toBe('about:blank');
});

test('five Options cycles add no history, and one Back from the title leaves', async ({ page }) => {
  await open(page, '&back');
  const before = await historyLength(page);
  for (let i = 0; i < 5; i++) {
    await row(page, 'Options').click();
    await expect.poll(() => sub(page)).toBe('options');
    await page.keyboard.press('Escape');
    await expect.poll(() => sub(page)).toBeNull();
    await expect.poll(() => armed(page)).toBe(false);
    expect(await historyLength(page)).toBeLessThanOrEqual(before + 1);
  }
  // Removing the entry leaves it as a forward entry (the length does not shrink), and the next push
  // replaces it, so the list never holds more than one guard entry however many cycles pass.
  expect(await historyLength(page)).toBeLessThanOrEqual(before + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toBe('about:blank');
});

test('Back closes Options five times in a row without leaving', async ({ page }) => {
  await open(page, '&back');
  for (let i = 0; i < 5; i++) {
    await row(page, 'Options').click();
    await expect.poll(() => sub(page)).toBe('options');
    await page.goBack();
    await expect.poll(() => sub(page)).toBeNull();
    expect(await screen(page)).toBe('title');
  }
  await page.goBack();
  await expect.poll(() => page.url()).toBe('about:blank');
});

test('quitting to the title lets go of the guard', async ({ page }) => {
  await open(page, '&back');
  await startPlaying(page);
  await expect.poll(() => armed(page)).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow('title'),
  );
  await expect.poll(() => screen(page)).toBe('title');
  await expect.poll(() => armed(page)).toBe(false);
  await page.goBack();
  await expect.poll(() => page.url()).toBe('about:blank');
});

test('without ?back the history is untouched and Back leaves', async ({ page }) => {
  await open(page, '');
  const before = await historyLength(page);
  await startPlaying(page);
  expect((await state(page)).back).toEqual({ enabled: false, armed: false });
  expect(await historyLength(page)).toBe(before);
  await page.goBack();
  await expect.poll(() => page.url()).toBe('about:blank');
});
