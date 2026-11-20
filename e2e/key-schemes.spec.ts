// Browser checks of the keyboard schemes: Modern is the Controls table's default, a saved scheme shows its own keys, and keys are named for the player's keyboard.
//
// The table draws keys as pixel-font glyphs, so these compare rows with the default's; the unit tests of `hints.ts` check the exact keys.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { settle } from './keys';

type Lf = { debugShow(s: string): void };

const OPTIONS_FILE = 'lf-options-v1';

async function open(
  page: Page,
  layout?: number,
  layoutMap?: [string, string][],
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([key, saved, map]) => {
      if (saved !== null)
        localStorage.setItem(
          key as string,
          JSON.stringify({ v: 1, global: {}, episodes: { 'episode-1': { layout: saved } } }),
        );
      if (map)
        Object.defineProperty(navigator, 'keyboard', {
          configurable: true,
          value: { getLayoutMap: async () => new Map(map as [string, string][]) },
        });
    },
    [OPTIONS_FILE, layout ?? null, layoutMap ?? null] as const,
  );
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  await settle(page, 4);
  return errors;
}

const table = (page: Page): Promise<string> => page.locator('#controls').innerText();
const jumpRow = (page: Page): Promise<string> =>
  page.locator('#controls tr', { hasText: 'Jump' }).innerText();

/** The Jump row with the default scheme and no layout map, from a fresh page. */
async function baselineJump(page: Page): Promise<string> {
  const errors = await open(page);
  expect(errors).toEqual([]);
  return jumpRow(page);
}

test('the Controls table shows Modern, with a Gamepad column, until another scheme is chosen', async ({
  page,
}) => {
  const errors = await open(page);
  const text = await table(page);
  expect(text).toContain('Modern');
  expect(text).toContain('Gamepad');
  expect(text).not.toContain('Keen-style');
  expect(errors).toEqual([]);
});

test('a saved scheme shows its own name and keys', async ({ page, browser }) => {
  const other = await browser.newPage();
  const base = await baselineJump(other);
  await other.close();
  const errors = await open(page, 2);
  const text = await table(page);
  expect(text).toContain('WASD');
  expect(text).not.toContain('Modern');
  // WASD jumps with Space, where Modern jumps with Z.
  expect(await jumpRow(page)).not.toBe(base);
  expect(errors).toEqual([]);
});

test('a key is named as it is printed on the player’s keyboard', async ({ page, browser }) => {
  const other = await browser.newPage();
  const base = await baselineJump(other);
  await other.close();
  // On AZERTY the key in the Z position types W.
  const errors = await open(page, undefined, [['KeyZ', 'w']]);
  expect(await jumpRow(page)).not.toBe(base);
  expect(errors).toEqual([]);
});
