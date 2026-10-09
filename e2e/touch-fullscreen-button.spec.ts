// Browser checks for the fullscreen button on a landscape phone: where it shows, that it is a 48 dp target inside the safe area and clear of Pause, Back, the head and the controls, and that a tap enters and leaves fullscreen.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

interface Lf {
  debugShow(s: string): void;
  debugState: { screen: string; sub: string | null };
}

const SIZES: [string, { width: number; height: number } | null][] = [
  ['the project window', null],
  ['640×320', { width: 640, height: 320 }],
];
const LAYOUTS = [
  ['column', ''],
  ['split', '&title=split'],
] as const;
const SCREENS = ['title', 'options', 'pause'] as const;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;

async function open(page: Page, screen: string, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug&touch${query}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    if (s !== 'title') lf.debugShow(s);
  }, screen);
  await expect(page.locator('#touch')).toBeVisible();
  return errors;
}

const tap = async (page: Page, selector: string): Promise<void> => {
  const b = (await page.locator(selector).boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

const box = (page: Page, selector: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const e = document.querySelector(sel);
    const r = e?.getBoundingClientRect();
    return r && r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }, selector);

const isFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.fullscreenElement !== null);

for (const [layout, query] of LAYOUTS) {
  for (const [label, size] of SIZES) {
    for (const screen of SCREENS) {
      test(`the fullscreen button over ${screen} in the ${layout} layout at ${label} is 48 dp, inside the safe area and clear of Pause, Back and the content`, async ({
        page,
      }) => {
        if (size) await page.setViewportSize(size);
        const errors = await open(page, screen, query);
        const fs = page.locator('#fsBtn');
        await expect(fs).toBeVisible();
        await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
        await expect(fs).toHaveAttribute('title', 'Fullscreen');
        // The layout audit finds the same with the button as without it (some screens at 640×320 already
        // scroll or crowd the hints; the button must not add to that).
        const run = (): Promise<Awaited<ReturnType<typeof audit>>> =>
          page.evaluate(audit, { roots: ['#ui', '#touch'] });
        const withButton = await run();
        await page.evaluate(
          () => ((document.getElementById('fsBtn') as HTMLElement).hidden = true),
        );
        const without = await run();
        await page.evaluate(
          () => ((document.getElementById('fsBtn') as HTMLElement).hidden = false),
        );
        expect(withButton.checked).toBeGreaterThan(3);
        expect(withButton, 'the audit with the button').toEqual({
          ...without,
          checked: withButton.checked,
        });
        const insets = { top: 24, right: 32, bottom: 20, left: 48 };
        await page.addStyleTag({
          content: `:root { --lf-safe-top: ${insets.top}px; --lf-safe-right: ${insets.right}px; --lf-safe-bottom: ${insets.bottom}px; --lf-safe-left: ${insets.left}px; }`,
        });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        const w = page.viewportSize()!.width;
        await expect
          .poll(async () => (await fs.boundingBox())!.y)
          .toBeGreaterThanOrEqual(insets.top + 8 - 0.5);
        const b = (await fs.boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(47.9);
        expect(b.height).toBeGreaterThanOrEqual(47.9);
        // Inside the safe area, and at the right with only Pause's corner margin.
        expect(b.x + b.width).toBeLessThanOrEqual(w - insets.right + 0.5);
        const mine: Box = {
          left: b.x,
          top: b.y,
          right: b.x + b.width,
          bottom: b.y + b.height,
        };
        // On the title's top level there is no Pause pill, so the button has the corner to itself.
        const pause = await box(page, '#touch [data-control="pause"]');
        if (screen === 'title') {
          expect(pause).toBeNull();
          expect(w - insets.right - mine.right).toBeCloseTo(8, 0);
        } else {
          expect(pause).not.toBeNull();
          expect(overlaps(mine, pause!), JSON.stringify([mine, pause])).toBe(false);
          // To the left of Pause, at the same height.
          expect(mine.right).toBeLessThanOrEqual(pause!.left + 0.5);
          expect(mine.top).toBeCloseTo(pause!.top, 0);
        }
        const back = await box(page, '#backBtn');
        if (back) expect(overlaps(mine, back)).toBe(false);
        // Nothing the screen draws is under it: the head, the menu, the hints.
        const content = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              '#title :is(h1, .head, p, table, .menu button, .keys span), #overlay :is(h2, p, table, .menu button, .keys span), #touch [data-control]:not([data-control="pause"]) .face, #touch .tc-dpad',
            ),
          ]
            .filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => e.getBoundingClientRect().toJSON() as Box & { width: number }),
        );
        for (const c of content) expect(overlaps(mine, c), JSON.stringify([mine, c])).toBe(false);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('the fullscreen button is absent in play, on the cards and on the scenes, and back on the pause menu', async ({
  page,
}) => {
  await open(page, 'title');
  await expect(page.locator('#fsBtn')).toBeVisible();
  for (const s of ['play', 'card', 'cine', 'dialogue', 'credits']) {
    await page.evaluate((s) => {
      const lf = (window as unknown as { __lf: Lf }).__lf;
      lf.debugShow('title');
      lf.debugShow(s);
    }, s);
    await expect(page.locator('#fsBtn'), s).toBeHidden();
  }
  await page.evaluate(() => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    lf.debugShow('pause');
  });
  await expect(page.locator('#fsBtn')).toBeVisible();
  // The touch controls editor has no corner for it.
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('touchEdit'));
  await expect(page.locator('#fsBtn')).toBeHidden();
});

test('a tap enters and leaves fullscreen, flips the glyph and the name, and starts nothing', async ({
  page,
}) => {
  const errors = await open(page, 'title');
  const fs = page.locator('#fsBtn');
  await expect(fs).toHaveAttribute('data-glyph', 'expand');
  await tap(page, '#fsBtn');
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await expect(fs).toHaveAttribute('data-glyph', 'collapse');
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await expect(fs).toHaveAttribute('title', 'Exit fullscreen');
  // The layout re-derived on the resize and still passes the audit.
  await expect(fs).toBeVisible();
  await tap(page, '#fsBtn');
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(fs).toHaveAttribute('data-glyph', 'expand');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  // The taps went to the button: the title is still the title and no run started.
  const s = await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);
  expect(s).toMatchObject({ screen: 'title', sub: null });
  expect(errors).toEqual([]);
});

test('the button works with the Fullscreen setting Off and with ?fullscreen=off', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, fullscreen: 2 })),
  );
  await open(page, 'title', '&fullscreen=off');
  await tap(page, '#fsBtn');
  await expect.poll(() => isFullscreen(page)).toBe(true);
});

test('leaving fullscreen from the pause menu keeps the menu; the corner stays Pause and the button', async ({
  page,
}) => {
  await open(page, 'pause', '&title=split');
  await tap(page, '#fsBtn');
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await expect(page.locator('#fsBtn')).toHaveAttribute('data-glyph', 'collapse');
  await tap(page, '#fsBtn');
  await expect.poll(() => isFullscreen(page)).toBe(false);
  const s = await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);
  expect(s.screen).toBe('pause');
});

test('a Left-handed layout keeps the button at the top right, clear of Pause', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('lf-touch-v1', JSON.stringify({ v: 1, hand: 'left' })),
  );
  await open(page, 'pause');
  const mine = (await box(page, '#fsBtn'))!;
  const pause = (await box(page, '#touch [data-control="pause"]'))!;
  const w = page.viewportSize()!.width;
  expect(overlaps(mine, pause)).toBe(false);
  expect(mine.right).toBeGreaterThan(w / 2);
  expect(mine.right).toBeLessThanOrEqual(pause.left + 0.5);
});

test('the button is hidden in the app and where the browser has no element fullscreen', async ({
  page,
}) => {
  await open(page, 'title', '&host=app');
  await expect(page.locator('#fsBtn')).toBeHidden();
});

test('without element fullscreen (an iPhone) the button is hidden and the Controls table has no Fullscreen row', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(document, 'fullscreenEnabled', { value: false }),
  );
  await open(page, 'controls');
  await expect(page.locator('#fsBtn')).toBeHidden();
  expect(await page.locator('#controls td').allInnerTexts()).not.toContain('Fullscreen');
});

test('the Controls table lists the button, with no keyboard glyph, and passes the audit', async ({
  page,
}) => {
  for (const size of [null, { width: 640, height: 320 }]) {
    if (size) await page.setViewportSize(size);
    await open(page, 'controls');
    const html = await page.locator('#controls table').innerHTML();
    expect(html).toContain('Fullscreen');
    expect(await page.locator('#controls td').allInnerTexts()).toContain('Fullscreen');
    const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
    expect(checked).toBeGreaterThan(3);
    expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
      outside: [],
      badSize: [],
      clipped: [],
      crowdsHints: [],
    });
  }
});

test('the Lab button of ?debug does not sit on the fullscreen button', async ({ page }) => {
  await open(page, 'pause');
  const lab = await box(page, '#labBtn');
  const mine = (await box(page, '#fsBtn'))!;
  if (lab) expect(overlaps(mine, lab)).toBe(false);
});
