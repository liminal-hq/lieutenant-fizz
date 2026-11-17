// Browser checks for the hidden Debug menu: 2 then Enter opens it from anywhere, and it warps without saving.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil, settle } from './keys';

type Lf = {
  debugShow(s: string): void;
  debugState: { screen: string; sub: string | null; level: number; mode: number };
};

async function open(page: Page, screen: string): Promise<void> {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await page.waitForTimeout(300);
  await settle(page);
}

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __lf: Lf }).__lf.debugState;
    return { screen: s.screen, sub: s.sub, level: s.level, mode: s.mode };
  });

async function sequence(page: Page): Promise<void> {
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await settle(page);
}

for (const screen of ['title', 'play', 'map', 'pause', 'options'] as const) {
  test(`2 then Enter opens the Debug menu from ${screen}, and Back returns to it`, async ({
    page,
  }) => {
    await open(page, screen);
    const before = await state(page);
    await sequence(page);
    expect(await state(page)).toMatchObject({ sub: 'debug' });
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await state(page)).toEqual(before);
  });
}

test('a lone Enter on the title still starts the highlighted row, and a lone 2 does nothing', async ({
  page,
}) => {
  await open(page, 'title');
  await page.keyboard.press('2');
  await settle(page);
  expect(await state(page)).toMatchObject({ screen: 'title', sub: null });
  // An Enter that comes after the sequence's time is just an Enter.
  await page.waitForTimeout(1700);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screen, { timeout: 5000 }).not.toBe('title');
});

test('Warp to level starts the chosen level', async ({ page }) => {
  await open(page, 'title');
  await sequence(page);
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await state(page)).toMatchObject({ sub: 'debugWarp' });
  await pressUntil(
    page,
    'ArrowDown',
    () =>
      (window as unknown as { __lf: { debugState: { menu: number } } }).__lf.debugState.menu === 1,
  );
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).screen, { timeout: 5000 }).toBe('play');
  expect(await state(page)).toMatchObject({ level: 1 });
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => /save|slot/i.test(k))),
  ).toEqual([]);
});
