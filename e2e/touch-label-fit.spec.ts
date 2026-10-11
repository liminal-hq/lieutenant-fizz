// Browser checks that every word on the touch controls stays inside its round face, on a tall phone too.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

/** The room a word keeps from the edge of its face, on each side. */
const MARGIN = 4;
const KEY = 'lf-touch-v1';

interface Lf {
  debugShow(s: string): void;
  debugAmmo(n: number): void;
}
interface Fit {
  control: string;
  text: string;
  fontSize: number;
  word: number;
  face: number;
}

/** The phone sizes: the installed app's full screen first (a Pixel 8 Pro in landscape), then the two the projects use. */
const SIZES = [
  { name: 'Pixel 8 Pro full screen', width: 1173, height: 527, scale: 2.55 },
  { name: '844×390', width: 844, height: 390, scale: 3 },
  { name: '740×360', width: 740, height: 360, scale: 2.6 },
];

/** Opens a screen with the controls pinned on, once the shell has placed them. */
async function open(page: Page, screen: string, size: 'S' | 'M' | 'L'): Promise<void> {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k!, v!),
    [KEY, JSON.stringify({ v: 1, size, opacity: 1, leftHanded: false, pos: {} })],
  );
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#touch')).toHaveAttribute(
    'data-mode',
    screen === 'play' ? 'play' : 'menu',
  );
  await page.waitForFunction(
    () => {
      const f = document.querySelector('#touch [data-control="jump"] .face');
      return !!f && f.getBoundingClientRect().width > 0;
    },
    null,
    { polling: 'raf' },
  );
}

/** The width of each word on a control (its text, not its box) against the width of the face it is on. */
const fits = (page: Page): Promise<Fit[]> =>
  page.evaluate(() => {
    const out: Fit[] = [];
    for (const c of document.querySelectorAll<HTMLElement>('#touch [data-control]')) {
      const face = c.querySelector<HTMLElement>('.face');
      if (!face || c.hidden) continue;
      for (const w of face.querySelectorAll<HTMLElement>('.lbl, .count')) {
        if (w.hidden || !w.textContent) continue;
        const r = document.createRange();
        r.selectNodeContents(w);
        out.push({
          control: c.dataset['control'] ?? '',
          text: w.textContent,
          fontSize: Number.parseFloat(getComputedStyle(w).fontSize),
          word: r.getBoundingClientRect().width,
          face: face.getBoundingClientRect().width,
        });
      }
    }
    return out;
  });

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale,
      isMobile: true,
      hasTouch: true,
    });
    // The sizes are set here, so one phone project runs them all.
    test.beforeEach(({ page: _page }, info) => {
      test.skip(info.project.name !== 'touch-844', 'Runs once, at its own sizes.');
    });

    // Title and Options show the menu's Select and Back; play shows Jump, Pogo and the Fizz count.
    for (const screen of ['title', 'options', 'play']) {
      for (const s of ['S', 'M', 'L'] as const) {
        test(`${screen}, Size ${s}: every word is inside its face with ${MARGIN} px to spare`, async ({
          page,
        }) => {
          await open(page, screen, s);
          const words = await fits(page);
          expect(words.length).toBeGreaterThan(0);
          for (const w of words) {
            expect(
              w.word,
              `${w.control} "${w.text}" is ${w.word} px at ${w.fontSize} px in a ${w.face} px face`,
            ).toBeLessThanOrEqual(w.face - 2 * MARGIN);
          }
        });
      }
    }

    // Soda adds ammo on every level load and nothing caps it, so the count can grow past three digits.
    for (const ammo of [999, 1000, 99999]) {
      for (const s of ['S', 'M', 'L'] as const) {
        test(`play, Size ${s}, ${ammo} Fizz: the count is inside its face`, async ({ page }) => {
          await open(page, 'play', s);
          await page.evaluate((n) => (window as unknown as { __lf: Lf }).__lf.debugAmmo(n), ammo);
          await expect(page.locator('#touch [data-control="fire"] .count')).toHaveText(/^\d+$/);
          const words = (await fits(page)).filter((w) => w.control === 'fire');
          expect(words.length).toBeGreaterThan(0);
          for (const w of words) {
            expect(
              w.word,
              `${w.control} "${w.text}" is ${w.word} px at ${w.fontSize} px in a ${w.face} px face`,
            ).toBeLessThanOrEqual(w.face - 2 * MARGIN);
          }
        });
      }
    }
  });
}
