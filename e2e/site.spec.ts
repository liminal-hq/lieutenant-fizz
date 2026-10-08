// Browser checks of the Fizz BBS site: Fizz at whole-pixel sizes, no clipping, menus and links that work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

const SITE = 'http://127.0.0.1:5197/';

for (const [w, h] of [
  [1280, 900],
  [1000, 615],
  [768, 900],
  [390, 700],
  [320, 640],
] as const) {
  test.describe(`site at ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    for (const [name, path] of [
      ['landing page', ''],
      ['game guide', 'guide/'],
    ] as const) {
      test(`the ${name} fits the window, is set in Fizz at whole-pixel sizes and has no clipped text`, async ({
        page,
      }) => {
        await page.goto(SITE + path);
        await page.evaluate(() => document.fonts.ready);
        const report = await page.evaluate(() => {
          const out = {
            overflow: '',
            badSize: [] as string[],
            outside: [] as string[],
            clipped: [] as string[],
          };
          const de = document.documentElement;
          if (de.scrollWidth > window.innerWidth)
            out.overflow = `${de.scrollWidth} > ${window.innerWidth}`;
          const texts = [...document.body.querySelectorAll('*')].filter(
            (e) =>
              e.getBoundingClientRect().width > 0 &&
              getComputedStyle(e).visibility !== 'hidden' &&
              [...e.childNodes].some(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
              ),
          );
          for (const e of texts) {
            // Visually hidden text (a one-pixel box) is read by screen readers, not laid out.
            if (e.closest('.sr, [hidden]') || e.getBoundingClientRect().width <= 2) continue;
            const cs = getComputedStyle(e);
            const name = `${e.tagName.toLowerCase()}.${e.className} “${(e.textContent ?? '').trim().slice(0, 20)}”`;
            const n = parseFloat(cs.fontSize) / 11;
            if (!Number.isInteger(n) || n < 2 || n > 6 || !/Fizz/.test(cs.fontFamily)) {
              out.badSize.push(`${name} ${cs.fontSize} ${cs.fontFamily}`);
            }
            const r = e.getBoundingClientRect();
            if (r.left < -0.5 || r.right > window.innerWidth + 0.5) out.outside.push(name);
            if (cs.display !== 'inline' && e.scrollWidth > e.clientWidth + 1)
              out.clipped.push(name);
          }
          return out;
        });
        expect(report, JSON.stringify(report, null, 2)).toEqual({
          overflow: '',
          badSize: [],
          outside: [],
          clipped: [],
        });
      });
    }

    test('every sprite loads on both pages', async ({ page }) => {
      for (const path of ['', 'guide/']) {
        await page.goto(SITE + path);
        const broken = await page.evaluate(async () => {
          const imgs = [...document.querySelectorAll<HTMLImageElement>('img.spr')];
          await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
          return imgs.length
            ? imgs.filter((i) => !i.naturalWidth).map((i) => i.src)
            : ['no sprites'];
        });
        expect(broken, path || 'landing page').toEqual([]);
      }
    });

    test('the main menu lists Episode 1 as playable and the next episodes as locked', async ({
      page,
    }) => {
      await page.goto(SITE);
      const menu = page.locator('#menu');
      // site.js has built the menu from episodes.json once the locked rows are there.
      await expect(menu.locator('li.locked')).toHaveCount(2);
      const rows = await menu.locator('li').allInnerTexts();
      expect(rows[0]).toMatch(/^\[1\]\s+Play Episode 1\s+FIZZ\.EXE$/);
      expect(rows.slice(-2)).toEqual([
        expect.stringMatching(/^\[7\]\s+Episode 2 · coming soon\s+LOCKED$/),
        expect.stringMatching(/^\[8\]\s+Episode 3 · coming soon\s+LOCKED$/),
      ]);
      await expect(menu.locator('li.locked a')).toHaveCount(0);
      await expect(menu.getByRole('link', { name: 'Play Episode 1' })).toHaveAttribute(
        'href',
        './episode-1/',
      );
      // The release log holds one block per released episode, and nothing for locked ones.
      await expect(page.locator('#latest .episode')).toHaveCount(1);
      await expect(page.locator('#latest')).toContainText('type EPISODE1.TXT');
      await expect(page.locator('#older .episode')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('EPISODE2.TXT');
    });

    test('the menu bar and menus link the pages together', async ({ page }) => {
      await page.goto(SITE);
      await page.locator('.menubar').getByRole('link', { name: 'Game guide' }).click();
      await expect(page).toHaveURL(/\/guide\/$/);
      await expect(page.locator('.menubar [aria-current="page"]')).toHaveText('Game guide');
      for (const id of ['story', 'cast', 'enemies', 'snacks', 'world', 'moves', 'controls']) {
        await expect(page.locator(`#${id} h2`)).toBeVisible();
        await expect(page.locator(`#guide-menu a[href="#${id}"]`)).toHaveCount(1);
      }
      await page
        .locator('#guide-menu')
        .getByRole('link', { name: 'Back to the front page' })
        .click();
      await expect(page).toHaveURL(SITE);
      await page.locator('#menu').getByRole('link', { name: 'Game guide' }).click();
      await expect(page).toHaveURL(/\/guide\/$/);
      await page.locator('.menubar').getByRole('link', { name: 'Home' }).click();
      await expect(page).toHaveURL(SITE);
      await expect(page.locator('.menubar [aria-current="page"]')).toHaveText('Home');
    });

    test('the controls and enemy lists fit without scrolling sideways', async ({ page }) => {
      for (const [path, sel] of [
        ['', '#keys .box'],
        ['guide/', '#enemies .box'],
        ['guide/', '#controls .box'],
      ] as const) {
        await page.goto(SITE + path);
        const box = await page.evaluate((s) => {
          const p = document.querySelector(s) as HTMLElement;
          return { scroll: p.scrollWidth, client: p.clientWidth };
        }, sel);
        expect(box.scroll, sel).toBeLessThanOrEqual(box.client + 1);
      }
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the prompt cursor does not blink', async ({ page }) => {
    for (const path of ['', 'guide/']) {
      await page.goto(SITE + path);
      expect(await page.locator('.cur').evaluate((e) => getComputedStyle(e).animationName)).toBe(
        'none',
      );
    }
  });
});
