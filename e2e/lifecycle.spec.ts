// Browser checks of the lifecycle state: it is exposed, the screen is wanted on while playing and let go on pause,
// and a window blur pauses a level. Headless fullscreen and wake lock are unreliable, so only what is wanted is asserted.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

test('exposes the lifecycle state and boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&fullscreen=off');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  const life = await page.evaluate(
    () =>
      (window as unknown as { __lf: { debugState: { lifecycle: Record<string, unknown> } } }).__lf
        .debugState.lifecycle,
  );
  expect(life.host).toBe('web');
  expect(life.fullscreenWant).toBe('off');
  expect(life.lastFs).toBeNull();
  expect(errors).toEqual([]);
});

type Life = { awake: boolean; wake: { held: boolean; requests: number } };
type State = { screen: string; lifecycle: Life };

const state = (page: Page): Promise<State> =>
  page.evaluate(() => (window as unknown as { __lf: { debugState: State } }).__lf.debugState);

/** A key held long enough for the 60 Hz sim to see it. */
async function hold(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(300);
  await page.keyboard.up(key);
}

test('wants the screen on while playing, lets go on pause, and a blur pauses', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&fullscreen=off&wake=on');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  expect((await state(page)).lifecycle.awake).toBe(false);
  await page.locator('#title > .menu button', { hasText: 'New game' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('cine');
  await expect.poll(async () => (await state(page)).lifecycle.awake).toBe(true);
  await hold(page, 'Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  await hold(page, 'Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('pause');
  await expect.poll(async () => (await state(page)).lifecycle.awake).toBe(false);
  await hold(page, 'Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  await expect.poll(async () => (await state(page)).lifecycle.awake).toBe(true);
  // A synthetic blur: a real focus change is not reliable in headless Chromium.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await state(page)).screen).toBe('pause');
  await expect.poll(async () => (await state(page)).lifecycle.awake).toBe(false);
  expect(errors).toEqual([]);
});
