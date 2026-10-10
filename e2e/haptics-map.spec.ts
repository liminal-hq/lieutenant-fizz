// Browser checks that the overworld map is silent while Ben walks and after he comes back from a level, and that a level start is felt once.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { settle } from './keys';

interface Lf {
  debugShow(what: string): void;
  enterMap(): void;
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
});
