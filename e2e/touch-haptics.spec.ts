// Browser checks that haptics reach `navigator.vibrate` or a pad's motors only with `?haptics`, and stop when the page hides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Win {
  __vib: unknown[];
  __rumble: { effects: unknown[]; resets: number };
  __pad: { buttons: { pressed: boolean }[] };
  __lf: { debugState: { menu: number }; debugHaptics(): { plays: { cue: string }[] } };
}

/** Boots the title with a `navigator.vibrate` that records what it is given. */
async function open(page: Page, query: string, withPad = false): Promise<void> {
  if (withPad)
    await page.addInitScript(() => {
      // A standard pad whose motors record what they are asked to do.
      const rumble = { effects: [] as unknown[], resets: 0 };
      const pad = {
        index: 0,
        id: 'Fake pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
        vibrationActuator: {
          playEffect: (_t: string, p: unknown) => {
            rumble.effects.push(p);
            return Promise.resolve('complete');
          },
          reset: () => {
            rumble.resets++;
            return Promise.resolve('complete');
          },
        },
      };
      Object.assign(window, { __rumble: rumble, __pad: pad });
      navigator.getGamepads = () => [pad as unknown as Gamepad];
    });
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

  test('with a controller, gameplay rumbles the pad and not the phone, and hiding resets it', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== ONE, 'one viewport');
    await open(page, '&haptics&level=0', true);
    await page.evaluate(() => {
      (window as unknown as Win).__pad.buttons[0]!.pressed = true;
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Win).__rumble.effects.length))
      .toBeGreaterThan(0);
    expect(await calls(page)).toEqual([]);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Win).__rumble.resets))
      .toBeGreaterThan(0);
  });
});
