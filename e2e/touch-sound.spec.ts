// Browser checks for Options > Sound on a phone: 48 dp rows in the split menus, the steppers change the style, and Back lands on Sound.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

const KEY = 'lf-ep1-options-v1';

interface Lf {
  debugShow(s: string): void;
  debugAudio(): { mode: string };
  debugState: { screen: string; sub: string | null; menu: number };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

const row = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { has: page.locator('.lbl', { hasText: label }) });

const tapAt = async (sel: ReturnType<Page['locator']>, page: Page): Promise<void> => {
  const b = (await sel.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

const stored = (page: Page): Promise<Record<string, unknown> | null> =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);

test('Options > Sound on touch: full-height rows, the Style stepper switches the mode, and Back returns to Sound', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The split menus give the six rows their full 48 dp at 390 dp tall and 47 dp at 360 dp.
  await page.goto('/?debug&touch&title=split');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await lf(page, (g) => g.debugShow('options'));
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(row(page, 'Sound').locator('.val')).toHaveText('Enhanced');
  // Sound is a link row: one tap opens the screen.
  await tapAt(row(page, 'Sound'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Sound');
  expect(await lf(page, (g) => g.debugState.sub)).toBe('sound');
  const heights = await page
    .locator('#overlay .menu button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(heights).toHaveLength(6);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(
    page.viewportSize()!.height >= 390 ? 47.9 : 46.9,
  );
  // The Sound lab row sits after Effects. ?debug puts the lab on, so the row shows On (link), fixed.
  expect(await page.locator('#overlay .menu button .lbl').allInnerTexts()).toEqual([
    'Style',
    'Music',
    'Effects',
    'Sound lab',
    'Reset',
    'Back',
  ]);
  await expect(row(page, 'Sound lab').locator('.val')).toHaveText('On (link)');
  await expect(row(page, 'Sound lab')).toHaveClass(/dis/);
  await expect(row(page, 'Sound lab').locator('[data-step]')).toHaveCount(0);
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
  // The Style stepper steps to Classic, switches the mode and saves the choice.
  await tapAt(row(page, 'Style').locator('[data-step="-1"]'), page);
  await expect.poll(() => lf(page, (g) => g.debugAudio().mode)).toBe('classic');
  expect(await stored(page)).toMatchObject({ v: 1, audio: 1 });
  // Reset takes two taps and puts Style back on Auto.
  await tapAt(row(page, 'Reset'), page);
  await expect(row(page, 'Reset').locator('.val')).toHaveText('Tap again');
  await tapAt(row(page, 'Reset'), page);
  await expect.poll(() => lf(page, (g) => g.debugAudio().mode)).toBe('enhanced');
  expect(await stored(page)).toMatchObject({ audio: 0, music: 8, sfx: 8 });
  // The Back button closes the screen onto the Sound row.
  await tapAt(page.locator('#backBtn'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Sound');
  expect(errors).toEqual([]);
});

test('the Sound lab row shows the Lab button without ?debug, and it is still there after a reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?touch&title=split');
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  // Off by default: no button and no overlay in the page.
  await expect(page.locator('#labBtn, #lab')).toHaveCount(0);
  await tapAt(options, page);
  await tapAt(row(page, 'Sound'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Sound');
  await expect(row(page, 'Sound lab').locator('.val')).toHaveText('Off');
  await tapAt(row(page, 'Sound lab'), page);
  await expect(row(page, 'Sound lab').locator('.val')).toHaveText('On');
  await expect(page.locator('#labBtn')).toBeVisible();
  expect(await stored(page)).toMatchObject({ v: 1, lab: true });
  // It survives a reload, and Reset turns it off again.
  await page.reload();
  await expect(page.locator('#labBtn')).toBeVisible({ timeout: 20_000 });
  await tapAt(options, page);
  await tapAt(row(page, 'Sound'), page);
  await expect(row(page, 'Sound lab').locator('.val')).toHaveText('On');
  await tapAt(row(page, 'Reset'), page);
  await tapAt(row(page, 'Reset'), page);
  await expect(page.locator('#labBtn, #lab')).toHaveCount(0);
  expect(await stored(page)).toMatchObject({ lab: false });
  expect(errors).toEqual([]);
});
