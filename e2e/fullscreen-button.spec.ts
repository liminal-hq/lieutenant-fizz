// Browser checks for the fullscreen button and the F shortcut on a desktop: they show on the title, the menus and in play, enter and leave fullscreen, and step aside where element fullscreen cannot work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil, settle } from './keys';

interface Lf {
  debugShow(s: string): void;
  debugState: {
    screen: string;
    sub: string | null;
    back: { enabled: boolean; armed: boolean };
  };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

async function boot(page: Page, query = '', screen?: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  if (screen)
    await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  return errors;
}

const isFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.fullscreenElement !== null);
const FS = '#fsBtn';

test('the title shows a small fullscreen button at the top right, named for a screen reader', async ({
  page,
}) => {
  const errors = await boot(page);
  const fs = page.locator(FS);
  await expect(fs).toBeVisible();
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  await expect(fs).toHaveAttribute('title', 'Fullscreen');
  const b = (await fs.boundingBox())!;
  const { width } = page.viewportSize()!;
  expect(b.width).toBeLessThanOrEqual(40);
  expect(b.x + b.width).toBeCloseTo(width - 16, 0);
  expect(b.y).toBeCloseTo(16, 0);
  expect(errors).toEqual([]);
});

test('a click enters fullscreen and flips the glyph and name, and another leaves it', async ({
  page,
}) => {
  const errors = await boot(page);
  const fs = page.locator(FS);
  await expect(fs).toHaveAttribute('data-glyph', 'expand');
  await fs.click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await expect(fs).toHaveAttribute('data-glyph', 'collapse');
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await expect(fs).toHaveAttribute('title', 'Exit fullscreen');
  await fs.click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(fs).toHaveAttribute('data-glyph', 'expand');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  expect(errors).toEqual([]);
});

test('the request is one call to requestFullscreen per press, and the click keeps no focus on the button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __fsCalls: number };
    w.__fsCalls = 0;
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (...a) {
      w.__fsCalls++;
      return orig.apply(this, a);
    };
  });
  await boot(page);
  await page.locator(FS).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __fsCalls: number }).__fsCalls)).toBe(1);
  // Space and Enter belong to the game, so the button does not keep the focus.
  expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('fsBtn');
});

test('F toggles fullscreen on the title and the menus, and a held key does not toggle again', async ({
  page,
}) => {
  const errors = await boot(page);
  await pressUntil(page, 'f', () => document.fullscreenElement !== null);
  await expect(page.locator(FS)).toHaveAttribute('data-glyph', 'collapse');
  await pressUntil(page, 'f', () => document.fullscreenElement === null);
  await expect(page.locator(FS)).toHaveAttribute('data-glyph', 'expand');
  // Over Options.
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('options'));
  await pressUntil(page, 'f', () => document.fullscreenElement !== null);
  // A key that stays down repeats; only the first press counts, so the page stays fullscreen.
  await pressUntil(page, 'f', () => document.fullscreenElement === null);
  await settle(page);
  for (let i = 0; i < 5; i++) await page.keyboard.down('f');
  await page.keyboard.up('f');
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await settle(page, 12);
  expect(await isFullscreen(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('Ctrl+F, Alt+F and typing into a field do nothing', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'probe';
    document.body.append(i);
    i.focus();
  });
  await page.keyboard.press('f');
  await page.keyboard.type('fff');
  expect(await isFullscreen(page)).toBe(false);
  expect(await page.locator('#probe').inputValue()).toBe('ffff');
  await page.evaluate(() => (document.getElementById('probe') as HTMLInputElement).blur());
  await page.keyboard.press('Control+f');
  await page.keyboard.press('Alt+f');
  await settle(page, 12);
  expect(await isFullscreen(page)).toBe(false);
});

test('the Fullscreen setting and ?fullscreen=off govern the automatic requests only; the button and F still work', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, fullscreen: 2 })),
  );
  await boot(page, '&fullscreen=off');
  await page.locator(FS).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await pressUntil(page, 'f', () => document.fullscreenElement === null);
});

test('on a desktop nothing goes fullscreen by itself, including when a run starts', async ({
  page,
}) => {
  await boot(page, '', 'play');
  await expect.poll(() => lf(page, (g) => g.debugState.screen)).toBe('play');
  expect(await isFullscreen(page)).toBe(false);
});

test('in play the button is there; it enters fullscreen, and leaving fullscreen pauses the level', async ({
  page,
}) => {
  const errors = await boot(page, '', 'play');
  const fs = page.locator(FS);
  await expect(fs).toBeVisible();
  await fs.click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  expect(await lf(page, (g) => g.debugState.screen)).toBe('play');
  await pressUntil(page, 'f', () => document.fullscreenElement === null);
  await expect.poll(() => lf(page, (g) => g.debugState.screen)).toBe('pause');
  // The pause menu has the button too.
  await expect(fs).toBeVisible();
  expect(errors).toEqual([]);
});

test('the button is hidden on the scenes, where the corner is not free', async ({ page }) => {
  await boot(page);
  for (const s of ['cine', 'dialogue', 'credits']) {
    await page.evaluate((s) => {
      const g = (window as unknown as { __lf: Lf }).__lf;
      g.debugShow('title');
      g.debugShow(s);
    }, s);
    await expect(page.locator(FS), s).toBeHidden();
  }
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('card'));
  await expect(page.locator(FS)).toBeVisible();
});

test('in the app the button is hidden and F does nothing', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __fsCalls: number };
    w.__fsCalls = 0;
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (...a) {
      w.__fsCalls++;
      return orig.apply(this, a);
    };
  });
  await boot(page, '&host=app');
  await expect(page.locator(FS)).toBeHidden();
  await page.keyboard.press('f');
  await page.keyboard.press('f');
  await settle(page, 12);
  expect(await page.evaluate(() => (window as unknown as { __fsCalls: number }).__fsCalls)).toBe(0);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  expect(await page.locator('#controls td').allInnerTexts()).not.toContain('Fullscreen');
});

test('without element fullscreen the button is hidden and the shortcut is not listed', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(document, 'fullscreenEnabled', { value: false }),
  );
  await boot(page);
  await expect(page.locator(FS)).toBeHidden();
  expect(await page.locator('#title .keys span').allInnerTexts()).not.toContain('F Fullscreen');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  expect(await page.locator('#controls td').allInnerTexts()).not.toContain('Fullscreen');
});

test('the hint bar and the Controls table list F where the page can go fullscreen', async ({
  page,
}) => {
  await boot(page);
  const keys = await page.locator('#title .keys').innerText();
  expect(keys.replace(/\s+/g, ' ')).toContain('Fullscreen');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  const cells = await page.locator('#controls tr:last-child td').allInnerTexts();
  expect(cells[0]).toBe('Fullscreen');
  await expect(page.locator('#controls')).toBeVisible();
});

test('the button does not sit on the engine panel or Lab buttons of ?debug', async ({ page }) => {
  await boot(page, '', 'play');
  await expect(page.locator(FS)).toBeVisible();
  const boxes = await page.evaluate(() =>
    ['#fsBtn', '#panelBtn', '#labBtn'].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r && r.width > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    }),
  );
  const [mine, ...others] = boxes;
  expect(mine).not.toBeNull();
  for (const o of others) {
    if (!o) continue;
    const overlap =
      Math.min(o.r, mine!.r) > Math.max(o.l, mine!.l) &&
      Math.min(o.b, mine!.b) > Math.max(o.t, mine!.t);
    expect(overlap, JSON.stringify([mine, o])).toBe(false);
  }
});

test('entering and leaving fullscreen re-syncs the Back guard', async ({ page }) => {
  await boot(page, '', 'options');
  // Over Options there is an answer to Back, but a plain tab does not take Back.
  expect(await lf(page, (g) => g.debugState.back)).toMatchObject({ armed: false });
  await page.locator(FS).click();
  await expect.poll(() => lf(page, (g) => g.debugState.back.armed)).toBe(true);
  await page.locator(FS).click();
  await expect.poll(() => lf(page, (g) => g.debugState.back.armed)).toBe(false);
});
