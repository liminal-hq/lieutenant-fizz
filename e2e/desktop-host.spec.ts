// Browser checks for the desktop app's host features, with the fake desktop host (`?debug&host=fake-desktop`): Quit game on the title and pause menus, its two-tap confirm on the pause menu, native fullscreen on F and F11 and from the Display row, and that none of it shows on the web.
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
    lifecycle: { fullscreen: boolean; fsKind: string; fullscreenWant: string };
  };
}

const DESKTOP = '&host=fake-desktop';

async function open(
  page: Page,
  screen: string,
  query = DESKTOP,
  init?: () => void,
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    if (s !== 'title') lf.debugShow(s);
  }, screen);
  await settle(page);
  return errors;
}

/** The text of the rows of the menu under `root`, top to bottom. */
const labels = async (page: Page, root: Menu): Promise<string[]> =>
  (await page.locator(`${root} button`).allInnerTexts()).map((t) => t.trim());

/** The menu on the title, and the one the pause menu and the screens over the title use. */
const TITLE = '#title > .menu';
const OVERLAY = '#overlay .menu';
type Menu = typeof TITLE | typeof OVERLAY;

const quits = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __lfQuits?: number }).__lfQuits ?? 0);
const nativeFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen);

/** Moves the selection to the row called `label` in the menu under `root` (ArrowUp wraps from the first row to the last). */
async function toLastRow(page: Page, root: Menu, label: string): Promise<void> {
  await pressUntil(
    page,
    'ArrowUp',
    (arg) => {
      const [r, l] = arg.split('|');
      return !!document.querySelector(`${r} button.sel`)?.textContent?.startsWith(l!);
    },
    `${root}|${label}`,
  );
}

test('the title menu ends with Quit game, and one Enter quits', async ({ page }) => {
  const errors = await open(page, 'title');
  expect((await labels(page, TITLE)).slice(-2)).toEqual(['Quit to launcher', 'Quit game']);
  await toLastRow(page, TITLE, 'Quit game');
  await pressUntil(page, 'Enter', () => true);
  await expect.poll(() => quits(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('the pause menu ends with Quit game, which asks twice', async ({ page }) => {
  const errors = await open(page, 'pause');
  const all = await labels(page, OVERLAY);
  expect(all.at(-1)).toBe('Quit game');
  expect(all.slice(-3)).toEqual(['Quit to title', 'Quit to launcher', 'Quit game']);
  await toLastRow(page, OVERLAY, 'Quit game');
  const row = page.locator('#overlay .menu button.sel');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  expect(await quits(page)).toBe(0);
  await expect(row.locator('.val')).toHaveText('Tap again');
  await pressUntil(page, 'Enter', () => true);
  await expect.poll(() => quits(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('the first tap on the pause menu times out, and moving off the row disarms it', async ({
  page,
}) => {
  await open(page, 'pause');
  await toLastRow(page, OVERLAY, 'Quit game');
  const val = page.locator('#overlay .menu button.sel .val');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  // The arm lasts three seconds, then the row goes back to its plain label.
  await expect(val).toHaveCount(0, { timeout: 8000 });
  expect(await quits(page)).toBe(0);
  // Arm again, move up and back down: the move disarms it, so the next Enter only arms.
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  await pressUntil(
    page,
    'ArrowUp',
    () =>
      !!document
        .querySelector('#overlay .menu button.sel')
        ?.textContent?.startsWith('Quit to launcher'),
  );
  await pressUntil(
    page,
    'ArrowDown',
    () =>
      !!document.querySelector('#overlay .menu button.sel')?.textContent?.startsWith('Quit game'),
  );
  await expect(val).toHaveCount(0);
  expect(await quits(page)).toBe(0);
});

const leaves = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __lfLauncherLeaves?: number }).__lfLauncherLeaves ?? 0,
  );

test('the title menu has Quit to launcher, which leaves on one Enter without quitting', async ({
  page,
}) => {
  const errors = await open(page, 'title');
  await toLastRow(page, TITLE, 'Quit to launcher');
  await pressUntil(page, 'Enter', () => true);
  await expect.poll(() => leaves(page)).toBe(1);
  expect(await quits(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the pause menu has Quit to launcher, which asks twice and then leaves', async ({ page }) => {
  const errors = await open(page, 'pause');
  await toLastRow(page, OVERLAY, 'Quit to launcher');
  const armed = (): boolean =>
    document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again';
  await pressUntil(page, 'Enter', armed);
  expect(await leaves(page)).toBe(0);
  // The armed row is Quit to launcher alone: Quit game below it is still plain.
  await expect(
    page.locator('#overlay .menu button', { hasText: 'Quit game' }).locator('.val'),
  ).toHaveCount(0);
  await pressUntil(page, 'Enter', () => true);
  await expect.poll(() => leaves(page)).toBe(1);
  expect(await quits(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('arming Quit to launcher does not arm Quit game, so one Enter on it only arms it', async ({
  page,
}) => {
  await open(page, 'pause');
  await toLastRow(page, OVERLAY, 'Quit to launcher');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  await pressUntil(
    page,
    'ArrowDown',
    () =>
      !!document.querySelector('#overlay .menu button.sel')?.textContent?.startsWith('Quit game'),
  );
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  expect(await quits(page)).toBe(0);
  expect(await leaves(page)).toBe(0);
});

test('Android has Quit to launcher and no Quit game', async ({ page }) => {
  const errors = await open(page, 'title', '&host=fake-android');
  expect((await labels(page, TITLE)).at(-1)).toBe('Quit to launcher');
  expect(await labels(page, TITLE)).not.toContain('Quit game');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await settle(page);
  expect((await labels(page, OVERLAY)).slice(-2)).toEqual(['Quit to title', 'Quit to launcher']);
  expect(errors).toEqual([]);
});

test('the web build has no Quit to launcher on the title or the pause menu', async ({ page }) => {
  await open(page, 'title', '');
  expect(await labels(page, TITLE)).not.toContain('Quit to launcher');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await settle(page);
  expect(await labels(page, OVERLAY)).not.toContain('Quit to launcher');
});

test('the web build has no Quit game on the title or the pause menu', async ({ page }) => {
  const errors = await open(page, 'title', '');
  expect(await labels(page, TITLE)).not.toContain('Quit game');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await settle(page);
  expect(await labels(page, OVERLAY)).not.toContain('Quit game');
  expect(errors).toEqual([]);
});

test('the app hides the web button; F and F11 toggle the native window, and Quit leaves fullscreen first', async ({
  page,
}) => {
  const errors = await open(page, 'title');
  await expect(page.locator('#fsBtn')).toBeHidden();
  expect(
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fsKind),
  ).toBe('native');
  expect(await nativeFullscreen(page)).toBe(false);
  await pressUntil(
    page,
    'f',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen,
  );
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await pressUntil(
    page,
    'f',
    () => !(window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen,
  );
  await pressUntil(
    page,
    'F11',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen,
  );
  await toLastRow(page, TITLE, 'Quit game');
  await pressUntil(page, 'Enter', () => true);
  await expect.poll(() => quits(page)).toBe(1);
  expect(await nativeFullscreen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('Esc in native fullscreen leaves it from the pause menu, and does not quit', async ({
  page,
}) => {
  await open(page, 'pause');
  await pressUntil(
    page,
    'f',
    () => (window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen,
  );
  await pressUntil(
    page,
    'Escape',
    () => !(window as unknown as { __lf: Lf }).__lf.debugState.lifecycle.fullscreen,
  );
  expect(await quits(page)).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.screen),
  ).toBe('pause');
});

test('the Fullscreen row exists in the app and steps through Auto, On and Off', async ({
  page,
}) => {
  await open(page, 'options');
  // Options > Display holds Fullscreen in the app.
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('display'));
  await settle(page);
  await expect(page.locator('#overlay .menu button', { hasText: 'Fullscreen' })).toContainText(
    'Auto',
  );
  await page.locator('#overlay .menu button', { hasText: 'Fullscreen' }).click();
  await expect(page.locator('#overlay .menu button', { hasText: 'Fullscreen' })).toContainText(
    'On',
  );
  await page.locator('#overlay .menu button', { hasText: 'Fullscreen' }).click();
  await expect(page.locator('#overlay .menu button', { hasText: 'Fullscreen' })).toContainText(
    'Off',
  );
});

test('Fullscreen On starts the app fullscreen at launch, Auto and Off leave the window as it is', async ({
  page,
}) => {
  for (const [choice, expected] of [
    [1, true],
    [0, false],
    [2, false],
  ] as const) {
    await page.addInitScript(
      (c) => localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, fullscreen: c })),
      choice,
    );
    await open(page, 'title');
    await expect.poll(() => nativeFullscreen(page)).toBe(expected);
    await page.reload();
  }
});

test('the layout audit passes on the title and pause menus with Quit game', async ({ page }) => {
  for (const screen of ['title', 'pause', 'options']) {
    await open(page, screen);
    const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui'] });
    expect(checked).toBeGreaterThan(3);
    expect(problems, `${screen}: ${JSON.stringify(problems, null, 2)}`).toMatchObject({
      pageOverflow: [],
      outside: [],
      badSize: [],
      clipped: [],
      crowdsHints: [],
      shortRows: [],
      selectedHidden: [],
      menuCrowds: [],
      cueCrowds: [],
    });
  }
});
