// Browser checks that the overlay fits, stays crisp and clears the hint bar on every screen.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

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

interface Report {
  pageOverflow: string[];
  outside: string[];
  badSize: string[];
  clipped: string[];
  crowdsHints: string[];
  /** How many text elements were inspected, so an empty page cannot pass by accident. */
  checked: number;
}

/** Runs in the page: collects every layout problem on the screen that is showing. */
function audit(): Report {
  const report: Report = {
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
    checked: 0,
  };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const de = document.documentElement;
  if (de.scrollWidth > w || de.scrollHeight > h) {
    report.pageOverflow.push(`${de.scrollWidth}x${de.scrollHeight} in ${w}x${h}`);
  }
  const ui = document.getElementById('ui') as HTMLElement;
  const visible = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none' &&
      Number(cs.opacity) > 0
    );
  };
  const name = (e: Element): string =>
    `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className ? `.${e.className.split(' ').join('.')}` : ''} “${(e.textContent ?? '').trim().slice(0, 24)}”`;
  const hasText = (e: Element): boolean =>
    [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
  const texts = [...ui.querySelectorAll('*')].filter((e) => visible(e) && hasText(e));
  report.checked = texts.length;
  const keys = [...ui.querySelectorAll('.keys')].find(visible);
  const keysRect = keys?.getBoundingClientRect();
  for (const e of texts) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (r.left < -0.5 || r.top < -0.5 || r.right > w + 0.5 || r.bottom > h + 0.5) {
      report.outside.push(
        `${name(e)} at ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`,
      );
    }
    const px = parseFloat(cs.fontSize);
    const n = px / 11;
    if (!Number.isInteger(n) || n < 2 || n > 6 || !cs.fontFamily.includes('Fizz')) {
      report.badSize.push(`${name(e)} is ${cs.fontSize} ${cs.fontFamily}`);
    }
    if (
      cs.display !== 'inline' &&
      e.scrollWidth > e.clientWidth + 1 &&
      cs.overflowX === 'visible'
    ) {
      report.clipped.push(`${name(e)} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`);
    }
    if (keysRect && !keys?.contains(e) && e.id !== 'attractTag') {
      const overlap =
        Math.min(r.right, keysRect.right) > Math.max(r.left, keysRect.left) + 1 &&
        Math.min(r.bottom, keysRect.bottom) > Math.max(r.top, keysRect.top) + 1;
      if (overlap) report.crowdsHints.push(name(e));
    }
  }
  for (const id of ['title', 'overlay']) {
    const e = document.getElementById(id);
    if (e && visible(e) && e.scrollHeight > e.clientHeight + 1) {
      report.clipped.push(`#${id} scrolls: ${e.scrollHeight} > ${e.clientHeight}`);
    }
  }
  return report;
}

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
        const report = await page.evaluate(audit);
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
      await expect(page.locator('#attractTag')).toHaveText(/^Attract · /);
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
  const report = await page.evaluate(audit);
  expect(report.badSize.length).toBeGreaterThan(0);
});
