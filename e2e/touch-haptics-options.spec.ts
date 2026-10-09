// Browser checks for Options > Haptics on a phone: the row and screen, the strength steppers and their preview, the link rule and Reset.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

const TOUCH = 'lf-touch-v1';
const OPTIONS = 'lf-ep1-options-v1';

interface Lf {
  debugState: { screen: string; sub: string | null; menu: number };
  debugHaptics(): { plays: { cue: string; compiled?: number[] }[]; master: { device: number } };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

const row = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { has: page.locator('.lbl', { hasText: label }) });

const tapAt = async (sel: ReturnType<Page['locator']>, page: Page): Promise<void> => {
  const b = (await sel.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

const stored = (page: Page, key: string): Promise<Record<string, unknown> | null> =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);

/** Boots the title on a phone with `navigator.vibrate` recording what it is given, then opens Options > Haptics by touch. */
async function openHaptics(
  page: Page,
  query = '',
  saved: Record<string, string> = {},
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, saved);
  await page.goto(`/?debug&touch&title=split${query}`);
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  await tapAt(options, page);
  await tapAt(row(page, 'Haptics'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Haptics');
  return errors;
}

test('Options > Haptics on touch: full-height rows, Strength steps with a preview and is saved, and Back returns to Haptics', async ({
  page,
}) => {
  const errors = await openHaptics(page);
  expect(await lf(page, (g) => g.debugState.sub)).toBe('haptics');
  // No pad has been seen, so there is no Rumble row. Four rows keep the full 48 dp.
  expect(await page.locator('#overlay .menu button .lbl').allInnerTexts()).toEqual([
    'Strength',
    'Haptics lab',
    'Reset',
    'Back',
  ]);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Strong');
  await expect(row(page, 'Haptics lab').locator('.val')).toHaveText('On (link)');
  const heights = await page
    .locator('#overlay .menu button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(47.9);
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
  });
  // One step down: Medium (0.75), saved, and a jump plays at that strength as the preview.
  await tapAt(row(page, 'Strength').locator('[data-step="-1"]'), page);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Medium');
  expect(await stored(page, TOUCH)).toMatchObject({ v: 1, hapticStrength: 2 });
  await expect
    .poll(async () => (await lf(page, (g) => g.debugHaptics())).plays.at(-1))
    .toMatchObject({ cue: 'jump' });
  expect((await lf(page, (g) => g.debugHaptics())).master.device).toBe(0.75);
  // Light (0.5) previews too; Off plays nothing more.
  await tapAt(row(page, 'Strength').locator('[data-step="-1"]'), page);
  await tapAt(row(page, 'Strength').locator('[data-step="-1"]'), page);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Off');
  expect(await stored(page, TOUCH)).toMatchObject({ hapticStrength: 0 });
  const plays = (await lf(page, (g) => g.debugHaptics())).plays;
  expect(plays.filter((p) => p.cue === 'jump')).toHaveLength(2);
  expect((await lf(page, (g) => g.debugHaptics())).master.device).toBe(0);
  // Back lands on the Haptics row of Options, whose value follows.
  await tapAt(page.locator('#backBtn'), page);
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Haptics');
  await expect(row(page, 'Haptics').locator('.val')).toHaveText('Off');
  expect(errors).toEqual([]);
});

test('an older save with haptics off reads as Strength Off, and Reset takes two taps and puts Strong back', async ({
  page,
}) => {
  const errors = await openHaptics(page, '', {
    [TOUCH]: JSON.stringify({ v: 1, size: 'L', haptics: false }),
  });
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Off');
  await tapAt(row(page, 'Reset'), page);
  await expect(row(page, 'Reset').locator('.val')).toHaveText('Tap again');
  await tapAt(row(page, 'Reset'), page);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Strong');
  // Only the haptics fields: the rest of the touch settings stay.
  expect(await stored(page, TOUCH)).toMatchObject({ size: 'L', hapticStrength: 3 });
  expect(errors).toEqual([]);
});

test('?haptics=off fixes Strength as Off (link): no steppers, a tap changes nothing and nothing is saved', async ({
  page,
}) => {
  const saved = JSON.stringify({ v: 1, hapticStrength: 2 });
  const errors = await openHaptics(page, '&haptics=off', { [TOUCH]: saved });
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Off (link)');
  await expect(row(page, 'Strength')).toHaveClass(/dis/);
  await expect(row(page, 'Strength').locator('[data-step]')).toHaveCount(0);
  // ?debug fixes the lab row too, so the screen opens on Reset, the first row that can change.
  await expect(row(page, 'Haptics lab').locator('.val')).toHaveText('On (link)');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Reset');
  await tapAt(row(page, 'Strength'), page);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('Off (link)');
  expect(await stored(page, TOUCH)).toEqual(JSON.parse(saved));
  expect((await lf(page, (g) => g.debugHaptics())).master.device).toBe(0);
  expect(errors).toEqual([]);
});

test('?haptics fixes Strength as On (link), at the saved strength, and the lab row is still the player’s without ?debug', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k!, v!),
    [TOUCH, JSON.stringify({ v: 1, hapticStrength: 1 })],
  );
  await page.goto('/?touch&title=split&haptics');
  const options = page.locator('#title .menu button', { hasText: 'Options' });
  await expect(options).toBeVisible({ timeout: 20_000 });
  await tapAt(options, page);
  await expect(row(page, 'Haptics').locator('.val')).toHaveText('On (link)');
  await tapAt(row(page, 'Haptics'), page);
  await expect(row(page, 'Strength').locator('.val')).toHaveText('On (link)');
  // Without ?debug the Haptics lab row is the player's own choice and starts Off.
  await expect(row(page, 'Haptics lab').locator('.val')).toHaveText('Off');
  await tapAt(row(page, 'Haptics lab'), page);
  await expect(row(page, 'Haptics lab').locator('.val')).toHaveText('On');
  expect(await stored(page, OPTIONS)).toMatchObject({ hapticsLab: true });
  // The saved Light strength is untouched by the link.
  expect(await stored(page, TOUCH)).toMatchObject({ hapticStrength: 1 });
  expect(errors).toEqual([]);
});
