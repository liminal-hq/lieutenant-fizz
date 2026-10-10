// Browser checks that the overworld map is silent while Ben walks and after he comes back from a level, and that a level start is felt once.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { settle } from './keys';

interface Lf {
  debugShow(what: string): void;
  enterMap(): void;
  debugEnterLevel(id: number): void;
  debugHaptics(): { plays: { cue: string }[] };
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
  });
  await page.goto('/?debug&haptics');
  await page.waitForFunction(() => (window as unknown as { __lf?: Lf }).__lf, null, {
    timeout: 20_000,
  });
}

const cues = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as { __lf: Lf }).__lf.debugHaptics().plays.map((p) => p.cue),
  );

test.describe('haptics on the map', () => {
  test('coming back from a level with the pogo on, and walking, raise no cue', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
    await settle(page, 10);
    // Pogo on, in the level.
    await page.keyboard.down('KeyX');
    await expect.poll(() => cues(page)).toContain('pogoOn');
    await page.keyboard.up('KeyX');
    const before = (await cues(page)).length;
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.enterMap());
    await settle(page, 10);
    await page.keyboard.down('ArrowRight');
    await settle(page, 60);
    await page.keyboard.up('ArrowRight');
    expect((await cues(page)).slice(before)).toEqual([]);
  });

  test('entering a level from the map is felt once', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('map'));
    await settle(page, 10);
    expect(await cues(page)).toEqual([]);
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugEnterLevel(0));
    await expect.poll(() => cues(page)).toEqual(['levelStart']);
    await settle(page, 30);
    expect((await cues(page)).filter((c) => c === 'levelStart')).toHaveLength(1);
  });

  test('the title attract loop is felt for on-screen world cues only, never under a sub-screen', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Slow: the loop has to reach its first bump.
    await open(page);
    // The Citadel's boulder (the third level of the loop) bumps the wall and raises KRUNCH.
    await page.evaluate(() =>
      (window as unknown as { __lf: { loadAttract(i: number): void } }).__lf.loadAttract(2),
    );
    const world = ['thunk', 'krunch', 'crumble', 'clang', 'thoom'];
    // The loop's rock bumps within its first passes; nothing but world cues may come out of it.
    await expect
      .poll(async () => (await cues(page)).some((c) => world.includes(c)), { timeout: 40_000 })
      .toBe(true);
    expect((await cues(page)).every((c) => world.includes(c))).toBe(true);
    // With Options open over the title, the loop goes quiet.
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('options'));
    await settle(page, 5);
    const n = (await cues(page)).length;
    await page.waitForTimeout(8_000);
    expect((await cues(page)).slice(n).filter((c) => !c.startsWith('ui.'))).toEqual([]);
  });
});
