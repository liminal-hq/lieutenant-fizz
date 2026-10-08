// Browser checks that the overlay fits, stays crisp and clears the hint bar on every screen.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

const SIZES = [
  [1280, 720],
  [1000, 615],
  [1600, 600],
  [390, 700],
] as const;

const SCREENS = [
  'title',
  'controls',
  'options',
  'saves',
  'pause',
  'cine',
  'dialogue',
  'credits',
] as const;
type Screen = (typeof SCREENS)[number];

/** Two saved slots, so the slot screen shows thumbnails and details as well as empty rows. */
const SAVE = {
  v: 3,
  at: Date.UTC(2026, 9, 7, 16),
  progress: {
    lives: 3,
    score: 12340,
    nextLife: 12400,
    ammo: 5,
    doneMask: 0b10111,
    played: 5400,
    map: { x: 12.4, y: 29 },
  },
};

async function show(page: Page, screen: Screen): Promise<void> {
  await page.goto('/?debug');
  // Fail at once, with the reason, if the browser cannot draw the game's WebGL2 canvas.
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl) {
    throw new Error(
      'This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl" or another software GL flag.',
    );
  }
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(
    (s) => (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow(s),
    screen,
  );
  // Let transitions and the first typed characters settle.
  await page.waitForTimeout(600);
}

for (const [w, h] of SIZES) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    for (const screen of SCREENS) {
      test(`${screen} fits, is crisp and clears the hint bar`, async ({ page }) => {
        await page.addInitScript((save) => {
          localStorage.setItem('lf-ep1-slot-1', JSON.stringify(save));
          localStorage.setItem(
            'lf-ep1-slot-3',
            JSON.stringify({ ...save, at: save.at - 86_400_000 }),
          );
        }, SAVE);
        // The credits roll scrolls in from below, so check its paged (reduced motion) form.
        if (screen === 'credits') await page.emulateMedia({ reducedMotion: 'reduce' });
        await show(page, screen);
        const report = await page.evaluate(audit, {});
        const { checked, ...problems } = report;
        expect(checked, `${screen} should have text on it`).toBeGreaterThan(3);
        expect(problems, JSON.stringify(problems, null, 2)).toEqual({
          pageOverflow: [],
          outside: [],
          badSize: [],
          clipped: [],
          crowdsHints: [],
        });
      });
    }

    test('the title shows Ben, the attract label and a soda bullet', async ({ page }) => {
      await show(page, 'title');
      await expect(page.locator('#title .ben')).toBeVisible();
      if (w >= 560) await expect(page.locator('#attractTag')).toBeVisible();
      await expect(page.locator('#attractTag')).toHaveText(/^Attract · /);
      // Nothing may paint over the label, such as the title's scrim.
      const covered = await page.evaluate(() => {
        const tag = document.getElementById('attractTag') as HTMLElement;
        // The label ignores the pointer, so let it be hit-tested while we look.
        tag.style.pointerEvents = 'auto';
        const r = tag.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        tag.style.pointerEvents = '';
        return !(top && (top === tag || tag.contains(top)));
      });
      // The label is hidden below 560 px wide by design.
      if (w >= 560) {
        expect(covered, 'the attract label is covered by another element').toBe(false);
      }
      await expect(page.locator('#title > .menu button.sel .bullet')).toBeVisible();
    });
  });
}

test('pixel text sizes are whole multiples of 11 at every scale', async ({ page }) => {
  for (const [w, h] of [
    [640, 400],
    [1000, 615],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await show(page, 'title');
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('#ui *')]
        .filter(
          (e) =>
            (e as HTMLElement).offsetParent &&
            [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
        )
        .map((e) => parseFloat(getComputedStyle(e).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(3);
    for (const px of sizes) expect(px % 11, `${px}px at ${w}x${h}`).toBe(0);
  }
});

test('the audit notices a size that is not a whole multiple of 11', async ({ page }) => {
  await show(page, 'title');
  await page.addStyleTag({ content: '#title .episode { font-size: 15px !important; }' });
  const report = await page.evaluate(audit, {});
  expect(report.badSize.length).toBeGreaterThan(0);
});
