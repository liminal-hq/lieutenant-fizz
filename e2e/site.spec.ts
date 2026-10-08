// Browser checks of the landing page: Fizz at whole-pixel sizes, and text that uses the width it has.
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
  test.describe(`landing page at ${w}×${h}`, () => {
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

    test('the guide shows every sprite and the sections are reachable', async ({ page }) => {
      await page.goto(`${SITE}guide/`);
      const broken = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll<HTMLImageElement>('img.spr')];
        await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
        return imgs.filter((i) => !i.naturalWidth).map((i) => i.src);
      });
      expect(broken).toEqual([]);
      for (const id of ['story', 'cast', 'enemies', 'snacks', 'world', 'moves', 'controls']) {
        await expect(page.locator(`#${id} h2`)).toBeVisible();
      }
      await page.goto(SITE);
      await page.getByRole('link', { name: 'Game guide' }).click();
      await expect(page).toHaveURL(/\/guide\/$/);
    });

    test('the intro text uses the width the page gives it', async ({ page }) => {
      await page.goto(SITE);
      const { lede, wrap } = await page.evaluate(() => {
        const l = (document.querySelector('.lede') as HTMLElement).getBoundingClientRect();
        const wr = document.querySelector('.hero') as HTMLElement;
        const cs = getComputedStyle(wr);
        return {
          lede: l.width,
          wrap: wr.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        };
      });
      // Up to a readable 90 characters (6 px a character at 2×, so 1080 px), the intro fills the content
      // width instead of a narrow column.
      expect(lede).toBeGreaterThanOrEqual(Math.min(wrap, 90 * 6 * 2) - 2);
    });

    test('every row of the controls fits without scrolling sideways', async ({ page }) => {
      await page.goto(SITE);
      const panel = await page.evaluate(() => {
        const p = document.querySelector('.panel') as HTMLElement;
        return { scroll: p.scrollWidth, client: p.clientWidth };
      });
      expect(panel.scroll).toBeLessThanOrEqual(panel.client + 1);
    });
  });
}
