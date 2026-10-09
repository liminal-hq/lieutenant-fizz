// Browser checks for Esc and the Pause key in fullscreen on a desktop. Headless Chromium cannot prove the real Keyboard Lock (the browser's own Esc handling is not in the way here), so `navigator.keyboard` is a spy and the real Fullscreen API is used.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { pressUntil, settle } from './keys';

interface Lf {
  debugShow(s: string): void;
  debugState: {
    screen: string;
    sub: string | null;
    lifecycle: { escLock: boolean };
  };
}

interface Spy {
  locks: string[][];
  unlocks: number;
}

type Mode = 'grant' | 'reject' | 'absent';

/** Stands in for `navigator.keyboard`: records the calls, and grants, refuses or is not there at all. */
async function stubKeyboard(page: Page, mode: Mode): Promise<void> {
  await page.addInitScript((m) => {
    const spy: Spy = { locks: [], unlocks: 0 };
    (window as unknown as { __kb: Spy }).__kb = spy;
    if (m === 'absent') {
      Object.defineProperty(navigator, 'keyboard', { value: undefined, configurable: true });
      return;
    }
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: {
        lock: (codes: string[]) => {
          spy.locks.push(codes);
          return m === 'reject' ? Promise.reject(new Error('refused')) : Promise.resolve();
        },
        unlock: () => {
          spy.unlocks++;
        },
      },
    });
  }, mode);
}

const spy = (page: Page): Promise<Spy> =>
  page.evaluate(() => (window as unknown as { __kb: Spy }).__kb);

async function boot(
  page: Page,
  mode: Mode,
  screen: string,
  options: Record<string, number> = {},
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubKeyboard(page, mode);
  if (Object.keys(options).length)
    await page.addInitScript(
      (o) => localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, ...o })),
      options,
    );
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => {
    const g = (window as unknown as { __lf: Lf }).__lf;
    g.debugShow('title');
    if (s !== 'title') g.debugShow(s);
  }, screen);
  return errors;
}

const screenOf = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.screen);
const subOf = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.sub);
const isFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.fullscreenElement !== null);
const held = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.escLock);

/** Enters fullscreen with the button and waits for the lock to be believed (when one is granted). */
async function goFullscreen(page: Page, lock: boolean): Promise<void> {
  await page.locator('#fsBtn').click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  if (lock) await expect.poll(() => held(page)).toBe(true);
}

/** Runs in the page, so it uses nothing from here: whether the game shows the screen. */
const atScreen = (want: string): boolean =>
  (window as unknown as { __lf: Lf }).__lf.debugState.screen === want;

test('Esc is locked when fullscreen starts and unlocked when it ends', async ({ page }) => {
  const errors = await boot(page, 'grant', 'title');
  expect(await spy(page)).toEqual({ locks: [], unlocks: 0 });
  await goFullscreen(page, true);
  expect((await spy(page)).locks).toEqual([['Escape']]);
  expect((await spy(page)).unlocks).toBe(0);
  await page.locator('#fsBtn').click();
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect.poll(async () => (await spy(page)).unlocks).toBe(1);
  expect(await held(page)).toBe(false);
  // A second visit locks again.
  await goFullscreen(page, true);
  expect((await spy(page)).locks).toEqual([['Escape'], ['Escape']]);
  expect(errors).toEqual([]);
});

test('F also takes and releases the lock', async ({ page }) => {
  await boot(page, 'grant', 'title');
  await pressUntil(page, 'f', () => document.fullscreenElement !== null);
  await expect.poll(() => held(page)).toBe(true);
  await pressUntil(page, 'f', () => document.fullscreenElement === null);
  await expect.poll(async () => (await spy(page)).unlocks).toBe(1);
});

test('with the lock, Esc in play opens the pause menu and the game stays fullscreen', async ({
  page,
}) => {
  const errors = await boot(page, 'grant', 'play');
  await goFullscreen(page, true);
  await pressUntil(page, 'Escape', atScreen, 'pause');
  expect(await isFullscreen(page)).toBe(true);
  await settle(page, 6);
  expect(await screenOf(page)).toBe('pause');
  expect(errors).toEqual([]);
});

test('with the lock, Esc on the pause menu leaves fullscreen and keeps the menu open', async ({
  page,
}) => {
  const errors = await boot(page, 'grant', 'pause');
  await goFullscreen(page, true);
  await pressUntil(page, 'Escape', () => document.fullscreenElement === null);
  await expect.poll(() => held(page)).toBe(false);
  await settle(page, 12);
  expect(await screenOf(page)).toBe('pause');
  // Outside fullscreen the same key resumes again.
  await pressUntil(page, 'Escape', atScreen, 'play');
  expect(errors).toEqual([]);
});

test('with the lock, Esc at the top of the title leaves fullscreen', async ({ page }) => {
  await boot(page, 'grant', 'title');
  await goFullscreen(page, true);
  await pressUntil(page, 'Escape', () => document.fullscreenElement === null);
  expect(await screenOf(page)).toBe('title');
});

test('with the lock, a screen over the pause menu closes first, and stays fullscreen', async ({
  page,
}) => {
  await boot(page, 'grant', 'options');
  await goFullscreen(page, true);
  expect(await subOf(page)).toBe('options');
  await pressUntil(
    page,
    'Escape',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.sub === null,
  );
  expect(await isFullscreen(page)).toBe(true);
  // Now at the top of the menu it takes the next Esc to leave.
  await pressUntil(page, 'Escape', () => document.fullscreenElement === null);
});

for (const [name, key] of [
  ['P', 'p'],
  ['the Pause key', 'Pause'],
] as const) {
  for (const [layout, options] of [
    ['Keen-style', { layout: 0 }],
    ['Modern', { layout: 1 }],
  ] as const) {
    test(`with the lock, ${name} pauses and resumes while fullscreen (${layout})`, async ({
      page,
    }) => {
      const errors = await boot(page, 'grant', 'play', options);
      await goFullscreen(page, true);
      await pressUntil(page, key, atScreen, 'pause');
      await pressUntil(page, key, atScreen, 'play');
      expect(await isFullscreen(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('the Pause key works outside fullscreen and a held key does not repeat', async ({ page }) => {
  await boot(page, 'grant', 'play');
  await settle(page);
  // Five key-downs without a key-up are one press and four repeats.
  for (let i = 0; i < 5; i++) await page.keyboard.down('Pause');
  await page.keyboard.up('Pause');
  await expect.poll(() => screenOf(page)).toBe('pause');
  await settle(page, 12);
  expect(await screenOf(page)).toBe('pause');
  await pressUntil(page, 'Pause', atScreen, 'play');
});

test('the Pause key is ignored while typing in a field', async ({ page }) => {
  await boot(page, 'grant', 'play');
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'probe';
    document.body.append(i);
    i.focus();
  });
  await page.keyboard.press('Pause');
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await settle(page, 12);
  expect(await screenOf(page)).toBe('play');
});

test('the Pause key does not take over another binding', async ({ page }) => {
  await boot(page, 'grant', 'play');
  await pressUntil(page, 'Pause', atScreen, 'pause');
  // Enter, Space and F still do their own jobs on the menu: F toggles fullscreen.
  await pressUntil(page, 'f', () => document.fullscreenElement !== null);
  expect(await screenOf(page)).toBe('pause');
});

test('hints in fullscreen with the lock read Exit fullscreen and P or Pause for Resume', async ({
  page,
}) => {
  await boot(page, 'grant', 'pause');
  const keys = page.locator('#overlay .keys');
  const text = async (): Promise<string> => (await keys.innerText()).replace(/\s+/g, ' ');
  expect(await text()).toContain('Resume');
  expect(await text()).toContain('Fullscreen');
  expect(await text()).not.toContain('Exit fullscreen');
  await goFullscreen(page, true);
  await expect.poll(text).toContain('Exit fullscreen');
  expect(await text()).toContain('Resume');
  expect(await text()).not.toMatch(/(^| )Fullscreen/);
  await page.locator('#fsBtn').click();
  await expect.poll(text).not.toContain('Exit fullscreen');
});

for (const mode of ['reject', 'absent'] as const) {
  test(`without the lock (${mode}), nothing changes: Esc is an ordinary key and never leaves fullscreen`, async ({
    page,
  }) => {
    const errors = await boot(page, mode, 'pause');
    await goFullscreen(page, false);
    // Give a late answer time to arrive.
    await settle(page, 12);
    expect(await held(page)).toBe(false);
    if (mode === 'reject') expect((await spy(page)).locks).toEqual([['Escape']]);
    // The hint bar is as it was: Esc resumes, and F is the fullscreen shortcut.
    const keys = (await page.locator('#overlay .keys').innerText()).replace(/\s+/g, ' ');
    expect(keys).toContain('Resume');
    expect(keys).not.toContain('Exit fullscreen');
    // An Esc that does reach the page (the browser would have taken it in a real window) resumes, as outside fullscreen.
    await pressUntil(page, 'Escape', atScreen, 'play');
    expect(await isFullscreen(page)).toBe(true);
    // Leaving fullscreen during play still pauses the run.
    await pressUntil(page, 'f', () => document.fullscreenElement === null);
    await expect.poll(() => screenOf(page)).toBe('pause');
    expect((await spy(page)).unlocks).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('Esc on the pause menu outside fullscreen still resumes, and the lock is untouched', async ({
  page,
}) => {
  await boot(page, 'grant', 'pause');
  await pressUntil(page, 'Escape', atScreen, 'play');
  expect(await spy(page)).toEqual({ locks: [], unlocks: 0 });
});

test.describe('the hint bar on a narrow window', () => {
  test.use({ viewport: { width: 390, height: 700 } });

  for (const screen of ['title', 'pause'] as const) {
    test(`over ${screen} it fits and clears the content, with and without the lock`, async ({
      page,
    }) => {
      await boot(page, 'grant', screen);
      const check = async (): Promise<void> => {
        await page.waitForTimeout(600);
        const { checked, ...problems } = await page.evaluate(audit, {});
        expect(checked).toBeGreaterThan(3);
        expect(problems, JSON.stringify(problems, null, 2)).toEqual({
          pageOverflow: [],
          outside: [],
          badSize: [],
          clipped: [],
          crowdsHints: [],
        });
      };
      await check();
      await goFullscreen(page, true);
      await expect(page.locator('.keys:visible', { hasText: 'Exit fullscreen' })).toBeVisible();
      await check();
    });
  }
});
