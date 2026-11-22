// Browser checks of the keyboard schemes: Modern is the Controls table's default, a saved scheme shows its own keys, and keys are named for the player's keyboard.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// The table draws keys as pixel-font glyphs, so these compare rows with the default's; the unit tests of `hints.ts` check the exact keys.

import { expect, test, type Page } from '@playwright/test';
import { pressUntil, settle } from './keys';

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

/** The input word of each fixed tick while `act` runs in a level, with the scheme's index saved first. */
async function ticksDuring(
  page: Page,
  layout: number,
  act: (box: { x: number; y: number; width: number; height: number }) => Promise<void>,
): Promise<number[]> {
  await page.addInitScript(
    ([key, saved]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ v: 1, global: {}, episodes: { 'episode-1': { layout: saved } } }),
      ),
    [OPTIONS_FILE, layout] as const,
  );
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  type Log = { debugShow(s: string): void; debugPollLog(on: boolean): number[] };
  await page.evaluate(() => (window as unknown as { __lf: Log }).__lf.debugShow('play'));
  await settle(page, 10);
  const box = (await page.locator('canvas').first().boundingBox())!;
  await page.evaluate(() => (window as unknown as { __lf: Log }).__lf.debugPollLog(true));
  await act(box);
  await page.waitForTimeout(100);
  return page.evaluate(() => (window as unknown as { __lf: Log }).__lf.debugPollLog(false));
}

const FIRE = 64;
const POGO = 32;
const held = (words: number[], bit: number): number => words.filter((w) => (w & bit) !== 0).length;

test('in the Mouse scheme the left button fires and the right button works the pogo, on the game only', async ({
  page,
}) => {
  const words = await ticksDuring(page, 3, async (box) => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'left' });
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'right' });
  });
  expect(held(words, FIRE)).toBeGreaterThan(0);
  expect(held(words, POGO)).toBeGreaterThan(0);
});

test('in the Modern scheme the mouse does nothing', async ({ page }) => {
  const words = await ticksDuring(page, 1, async (box) => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'left' });
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'right' });
  });
  expect(held(words, FIRE)).toBe(0);
  expect(held(words, POGO)).toBe(0);
});

/** Steps the Options > Controls row once round with Right and returns each value it showed. */
async function controlsChoices(page: Page, query: string): Promise<string[]> {
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('options'));
  await settle(page, 4);
  await pressUntil(
    page,
    'ArrowDown',
    () => document.querySelector('#overlay .menu button.sel .lbl')?.textContent === 'Controls',
  );
  const value = page.locator('#overlay .menu button', { hasText: 'Controls' }).locator('.val');
  const clean = async (): Promise<string> => (await value.innerText()).replace(/[◄►]/g, '').trim();
  const seen: string[] = [await clean()];
  for (let i = 0; i < 7; i += 1) {
    const was = seen[seen.length - 1]!;
    await pressUntil(
      page,
      'ArrowRight',
      (before) =>
        document
          .querySelector('#overlay .menu button.sel .val')
          ?.textContent?.replace(/[◄►]/g, '')
          .trim() !== before,
      was,
    );
    seen.push(await clean());
  }
  return seen;
}

test('Options offers the Mouse scheme where there is a mouse', async ({ page }) => {
  const seen = await controlsChoices(page, '&mouse=on');
  expect(seen).toContain('Mouse');
  expect(new Set(seen).size).toBe(6);
});

test('Options does not offer the Mouse scheme without a mouse', async ({ page }) => {
  const seen = await controlsChoices(page, '&mouse=off');
  expect(seen).not.toContain('Mouse');
  expect(new Set(seen).size).toBe(5);
  expect(seen[0]).toBe('Modern');
});

test('a saved Mouse choice plays as Modern without a mouse, and the table shows Modern', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, saved]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ v: 1, global: {}, episodes: { 'episode-1': { layout: saved } } }),
      ),
    [OPTIONS_FILE, 3] as const,
  );
  await page.goto('/?debug&mouse=off');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  await settle(page, 4);
  const text = await table(page);
  expect(text).toContain('Modern');
  expect(text).not.toContain('Mouse');
});
