// Browser checks for Quit to launcher and Quit game with touch (a touch laptop running the desktop app): a tap on the pause menu's row asks twice, the title's quits on one tap, and the menus keep their layout with the extra row at both phone sizes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { settle } from './keys';

interface Lf {
  debugShow(s: string): void;
}

async function open(page: Page, screen: string, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug&touch${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    if (s !== 'title') lf.debugShow(s);
  }, screen);
  await expect(page.locator('#touch')).toBeVisible();
  await settle(page);
  return errors;
}

const quits = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __lfQuits?: number }).__lfQuits ?? 0);
const leaves = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __lfLauncherLeaves?: number }).__lfLauncherLeaves ?? 0,
  );
const row = (page: Page, root: '#title > .menu' | '#overlay .menu') =>
  page.locator(`${root} button`, { hasText: 'Quit game' });
const launcherRow = (page: Page, root: '#title > .menu' | '#overlay .menu') =>
  page.locator(`${root} button`, { hasText: 'Quit to launcher' });

const LAYOUTS = [
  ['column', ''],
  ['split', '&title=split'],
] as const;

for (const [layout, layoutQuery] of LAYOUTS) {
  test(`a tap on the title's Quit game quits (${layout} layout)`, async ({ page }) => {
    const errors = await open(page, 'title', `&host=fake-desktop${layoutQuery}`);
    await row(page, '#title > .menu').scrollIntoViewIfNeeded();
    await row(page, '#title > .menu').tap();
    await expect.poll(() => quits(page)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("the pause menu's Quit game arms on the first tap and quits on the second", async ({
  page,
}) => {
  const errors = await open(page, 'pause', '&host=fake-desktop');
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  await expect(row(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  expect(await quits(page)).toBe(0);
  await row(page, '#overlay .menu').tap();
  await expect.poll(() => quits(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('Quit game stays unarmed after Resume and a reopened pause menu', async ({ page }) => {
  const errors = await open(page, 'pause', '&host=fake-desktop');
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  await expect(row(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  // A tap on another row activates it directly, without moving the selection first.
  await page.locator('#overlay .menu button', { hasText: 'Resume' }).tap();
  await expect(row(page, '#overlay .menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(row(page, '#overlay .menu')).toBeVisible();
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  expect(await quits(page)).toBe(0);
  await expect(row(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  await row(page, '#overlay .menu').tap();
  await expect.poll(() => quits(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('a direct tap on another pause row disarms Quit game', async ({ page }) => {
  const errors = await open(page, 'pause', '&host=fake-desktop');
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  await expect(row(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  await page.locator('#overlay .menu button', { hasText: 'Options' }).tap();
  await page.keyboard.press('Escape');
  await expect(row(page, '#overlay .menu')).toBeVisible();
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  expect(await quits(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the touch Controls table does not point at a Fullscreen button the app hides', async ({
  page,
}) => {
  const errors = await open(page, 'controls', '&host=fake-desktop');
  await expect(page.locator('#fsBtn')).toBeHidden();
  const cells = await page.locator('#controls td').allInnerTexts();
  expect(cells).not.toContain('Fullscreen button');
  expect(cells).not.toContain('Fullscreen');
  expect(errors).toEqual([]);
});

test("a tap on the title's Quit to launcher leaves on one tap", async ({ page }) => {
  const errors = await open(page, 'title', '&host=fake-desktop');
  await launcherRow(page, '#title > .menu').scrollIntoViewIfNeeded();
  await launcherRow(page, '#title > .menu').tap();
  await expect.poll(() => leaves(page)).toBe(1);
  expect(await quits(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("the pause menu's Quit to launcher arms on the first tap and leaves on the second", async ({
  page,
}) => {
  const errors = await open(page, 'pause', '&host=fake-android');
  await expect(row(page, '#overlay .menu')).toHaveCount(0);
  await launcherRow(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await launcherRow(page, '#overlay .menu').tap();
  await expect(launcherRow(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  expect(await leaves(page)).toBe(0);
  await launcherRow(page, '#overlay .menu').tap();
  await expect.poll(() => leaves(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('Quit to launcher stays unarmed after Resume and a reopened pause menu', async ({ page }) => {
  const errors = await open(page, 'pause', '&host=fake-desktop');
  await launcherRow(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await launcherRow(page, '#overlay .menu').tap();
  await expect(launcherRow(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  await page.locator('#overlay .menu button', { hasText: 'Resume' }).tap();
  await expect(launcherRow(page, '#overlay .menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(launcherRow(page, '#overlay .menu')).toBeVisible();
  await launcherRow(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await launcherRow(page, '#overlay .menu').tap();
  expect(await leaves(page)).toBe(0);
  await expect(launcherRow(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  expect(errors).toEqual([]);
});

test('a tap on Quit game after arming Quit to launcher arms Quit game and leaves nothing', async ({
  page,
}) => {
  await open(page, 'pause', '&host=fake-desktop');
  await launcherRow(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await launcherRow(page, '#overlay .menu').tap();
  await row(page, '#overlay .menu').scrollIntoViewIfNeeded();
  await row(page, '#overlay .menu').tap();
  expect(await quits(page)).toBe(0);
  expect(await leaves(page)).toBe(0);
  await expect(row(page, '#overlay .menu').locator('.val')).toHaveText('Tap again');
  await expect(launcherRow(page, '#overlay .menu').locator('.val')).toHaveCount(0);
});

test('the web build has no Quit to launcher on touch', async ({ page }) => {
  await open(page, 'title', '');
  await expect(launcherRow(page, '#title > .menu')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await settle(page);
  await expect(launcherRow(page, '#overlay .menu')).toHaveCount(0);
});

test('the web build has no Quit game on touch either', async ({ page }) => {
  await open(page, 'title', '');
  await expect(row(page, '#title > .menu')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await settle(page);
  await expect(row(page, '#overlay .menu')).toHaveCount(0);
});

for (const [layout, layoutQuery] of LAYOUTS) {
  for (const screen of ['title', 'pause', 'display'] as const) {
    test(`the layout audit passes over ${screen} with Quit game (${layout} layout)`, async ({
      page,
    }) => {
      await open(page, screen, `&host=fake-desktop${layoutQuery}`);
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
    });
  }
}
