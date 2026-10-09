// Browser checks that haptics reach `navigator.vibrate` only with `?haptics`, and stop when the page hides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Win {
  __vib: unknown[];
  __lf: { debugState: { menu: number }; debugHaptics(): { plays: { cue: string }[] } };
}

/** Boots the title with a `navigator.vibrate` that records what it is given. */
async function open(page: Page, query: string): Promise<void> {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as Win).__vib = calls;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (p: unknown) => {
        calls.push(p);
        return true;
      },
    });
  });
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as Partial<Win>).__lf, null, {
    timeout: 20_000,
  });
}

const calls = (page: Page): Promise<unknown[]> =>
  page.evaluate(() => [...(window as unknown as Win).__vib]);
const menu = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as Win).__lf.debugState.menu);

// One phone size is enough: nothing here depends on the layout.
const ONE = 'touch-844';

test.describe('haptics', () => {
  test('a menu move vibrates and hiding the page stops it', async ({ page }, info) => {
    test.skip(info.project.name !== ONE, 'one viewport');
    await open(page, '&haptics');
    await page.keyboard.press('ArrowDown', { delay: 300 });
    await expect.poll(() => calls(page)).not.toEqual([]);
    expect((await calls(page))[0]).toEqual(expect.arrayContaining([expect.any(Number)]));
    // The title's attract loop raises captions too; none of them may reach the vibrator.
    await page.waitForTimeout(1500);
    const cues = await page.evaluate(() =>
      (window as unknown as Win).__lf.debugHaptics().plays.map((p) => p.cue),
    );
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.startsWith('ui.'))).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await calls(page)).at(-1)).toBe(0);
  });

  test('without the flag nothing vibrates', async ({ page }, info) => {
    test.skip(info.project.name !== ONE, 'one viewport');
    await open(page, '');
    const before = await menu(page);
    await page.keyboard.press('ArrowDown', { delay: 300 });
    await expect.poll(() => menu(page)).not.toBe(before);
    // Two frames after the move: a haptic cue would have played by then.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    expect(await calls(page)).toEqual([]);
  });
});
