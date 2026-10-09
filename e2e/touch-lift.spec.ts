// Browser checks that the default touch controls rise when the browser's bars go and fall back when they return.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

const KEY = 'lf-touch-v1';
type Id = 'dpad' | 'jump' | 'pogo' | 'fire' | 'pause';

interface Lf {
  debugShow(s: string): void;
  debugTouch: { face: Record<Id, { cx: number; cy: number; r: number }> } | null;
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

/** Opens a level with the controls showing; `?fullscreen=off` keeps the game from asking for fullscreen itself. */
async function play(page: Page, stored?: object): Promise<void> {
  if (stored) {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k!, v!),
      [KEY, JSON.stringify(stored)],
    );
  }
  // A standalone display mode the test can switch, as an installed app would.
  await page.addInitScript(() => {
    const w = window as unknown as { __standalone: boolean; __setStandalone(on: boolean): void };
    const lists: { fire: () => void }[] = [];
    const real = window.matchMedia.bind(window);
    w.__standalone = false;
    window.matchMedia = (q: string): MediaQueryList => {
      if (!q.includes('display-mode')) return real(q);
      const target = new EventTarget() as EventTarget & { matches: boolean; media: string };
      Object.defineProperty(target, 'matches', {
        get: () => w.__standalone && q.includes('standalone'),
      });
      target.media = q;
      lists.push({ fire: () => target.dispatchEvent(new Event('change')) });
      return target as unknown as MediaQueryList;
    };
    w.__setStandalone = (on: boolean): void => {
      w.__standalone = on;
      for (const l of lists) l.fire();
    };
  });
  await page.goto('/?debug&touch&fullscreen=off');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect.poll(() => lf(page, (g) => g.debugTouch !== null)).toBe(true);
}

const centres = async (page: Page): Promise<Record<Id, number>> => {
  const f = await lf(page, (g) => g.debugTouch!.face);
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.cy])) as Record<Id, number>;
};

const setStandalone = (page: Page, on: boolean): Promise<void> =>
  page.evaluate(
    (v) => (window as unknown as { __setStandalone(on: boolean): void }).__setStandalone(v),
    on,
  );

test('the default controls rise in an installed app and fall back when it ends', async ({
  page,
}) => {
  await play(page);
  const bars = await centres(page);
  await setStandalone(page, true);
  await expect.poll(async () => (await centres(page)).dpad).toBeLessThan(bars.dpad - 20);
  const up = await centres(page);
  for (const id of ['dpad', 'jump', 'pogo', 'fire'] as const) {
    expect(up[id], id).toBeLessThan(bars[id] - 20);
  }
  expect(up.pause).toBe(bars.pause);
  // The DOM follows the placement.
  const jump = await page.locator('#touch [data-control="jump"]').boundingBox();
  expect(jump!.y + jump!.height / 2).toBeCloseTo(up.jump, 0);
  await setStandalone(page, false);
  await expect.poll(async () => (await centres(page)).dpad).toBe(bars.dpad);
  expect(await centres(page)).toEqual(bars);
});

test('a moved control stays where the player put it while the others rise', async ({ page }) => {
  await play(page, { v: 1, size: 'M', pos: { dpad: { side: 60, bottom: 30 } } });
  const bars = await centres(page);
  await setStandalone(page, true);
  await expect.poll(async () => (await centres(page)).jump).toBeLessThan(bars.jump - 20);
  const up = await centres(page);
  expect(up.dpad).toBe(bars.dpad);
  expect(up.pogo).toBeLessThan(bars.pogo - 20);
});

test('the default controls rise in real fullscreen and fall back on leaving it', async ({
  page,
}) => {
  await play(page);
  const bars = await centres(page);
  const entered = await page.evaluate(async () => {
    try {
      await document.documentElement.requestFullscreen();
      return document.fullscreenElement !== null;
    } catch {
      return false;
    }
  });
  test.skip(!entered, 'this Chromium would not enter fullscreen');
  await expect.poll(async () => (await centres(page)).dpad).toBeLessThan(bars.dpad - 20);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(async () => (await centres(page)).dpad).toBe(bars.dpad);
});
