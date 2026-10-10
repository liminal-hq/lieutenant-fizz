// Browser checks for the Back gesture's peek, with a fake Android host that takes its gesture frames from `window.__lfPredictiveBack`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { settle } from './keys';

interface Lf {
  debugShow(s: string): void;
  debugState: { screen: string; sub: string | null };
}
type Frame = {
  type: 'started' | 'progress' | 'cancelled' | 'invoked';
  progress?: number;
  swipeEdge?: 'left' | 'right';
};

async function open(page: Page, screen: 'title' | 'pause'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&touch&host=fake-android');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    if (s !== 'title') lf.debugShow(s);
  }, screen);
  await expect(page.locator('#touch')).toBeVisible();
  await settle(page);
  return errors;
}

const emit = async (page: Page, frame: Frame): Promise<void> => {
  await page.evaluate(
    (f) =>
      (
        window as unknown as { __lfPredictiveBack: { emit(f: unknown): void } }
      ).__lfPredictiveBack.emit(f),
    frame,
  );
  await settle(page, 2);
};

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);

/** The sliding copy's look: its opacity and how far it has moved sideways, in pixels. */
const ghost = (page: Page) =>
  page.evaluate(() => {
    const g = document.querySelector('.peek-ghost');
    if (!g) return null;
    const cs = getComputedStyle(g);
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    return {
      opacity: Number(cs.opacity),
      x: m.e,
      title: g.querySelector('h2')?.textContent ?? '',
      inert: (g as HTMLElement).inert,
      hidden: g.getAttribute('aria-hidden'),
    };
  });

const heading = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector<HTMLElement>('#overlay:not(.peek-ghost) h2')?.textContent ?? '',
  );

const visible = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => {
    const el = document.querySelector<HTMLElement>(s);
    return !!el && !el.hidden;
  }, selector);

const show = async (page: Page, what: string): Promise<void> => {
  await page.evaluate(
    (w) => (window as unknown as { __lf: { debugShow(s: string): void } }).__lf.debugShow(w),
    what,
  );
  await settle(page);
};

const tapRow = async (page: Page, root: '#title > .menu' | '#overlay .menu', label: string) => {
  const b = page.locator(`${root} button`, { hasText: label }).first();
  await expect(b).toBeVisible();
  const r = (await b.boundingBox())!;
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  await settle(page);
};

test('the pause menu slides and fades with the gesture, and glides back when it is cancelled', async ({
  page,
}) => {
  const errors = await open(page, 'pause');
  expect(await ghost(page)).toBeNull();
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.25, swipeEdge: 'left' });
  const early = await ghost(page);
  await emit(page, { type: 'progress', progress: 0.6, swipeEdge: 'left' });
  const later = await ghost(page);
  expect(early).not.toBeNull();
  expect(later).not.toBeNull();
  expect(later!.x).toBeGreaterThan(early!.x);
  expect(early!.x).toBeGreaterThan(0);
  expect(later!.opacity).toBeLessThan(early!.opacity);
  expect(early!.opacity).toBeLessThan(1);
  expect(later!.inert).toBe(true);
  expect(later!.hidden).toBe('true');
  // The game shows through: the pause menu itself is gone from under the copy, and the screen is unchanged.
  expect(await visible(page, '#overlay:not(.peek-ghost)')).toBe(false);
  expect((await state(page)).screen).toBe('pause');
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
  expect(await visible(page, '#overlay')).toBe(true);
  expect(await heading(page)).toBe('Paused');
  expect((await state(page)).screen).toBe('pause');
  expect(errors).toEqual([]);
});

test('a committed gesture on the pause menu resumes the game with no menu left behind', async ({
  page,
}) => {
  const errors = await open(page, 'pause');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.8, swipeEdge: 'left' });
  await emit(page, { type: 'invoked', progress: 1 });
  expect((await state(page)).screen).toBe('play');
  expect(await ghost(page)).toBeNull();
  expect(await visible(page, '#overlay')).toBe(false);
  expect(errors).toEqual([]);
});

test('a swipe from the right edge slides the other way', async ({ page }) => {
  await open(page, 'pause');
  await emit(page, { type: 'started', swipeEdge: 'right' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'right' });
  expect((await ghost(page))!.x).toBeLessThan(0);
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
});

test('reduced motion only fades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'pause');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  const g = (await ghost(page))!;
  expect(g.x).toBe(0);
  expect(g.opacity).toBeLessThan(1);
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
});

test('Options over the title peeks onto the title menu, and a cancel puts Options back', async ({
  page,
}) => {
  const errors = await open(page, 'title');
  await show(page, 'options');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  const g = (await ghost(page))!;
  expect(g.title).toBe('Options');
  expect(g.x).toBeGreaterThan(0);
  // What Back goes to is already showing under it: the title menu, and no overlay.
  expect(await visible(page, '#title')).toBe(true);
  expect(await visible(page, '#overlay:not(.peek-ghost)')).toBe(false);
  expect((await state(page)).sub).toBe('options');
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
  expect(await heading(page)).toBe('Options');
  expect(await visible(page, '#title')).toBe(false);
  expect((await state(page)).sub).toBe('options');

  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.9, swipeEdge: 'left' });
  await emit(page, { type: 'invoked', progress: 1 });
  expect((await state(page)).sub).toBeNull();
  expect(await ghost(page)).toBeNull();
  expect(await visible(page, '#title')).toBe(true);
  expect(await visible(page, '#overlay')).toBe(false);
  expect(errors).toEqual([]);
});

test('Sound over Options over the pause menu peeks onto Options, then onto the pause menu', async ({
  page,
}) => {
  const errors = await open(page, 'pause');
  await tapRow(page, '#overlay .menu', 'Options');
  await tapRow(page, '#overlay .menu', 'Sound');
  expect((await state(page)).sub).toBe('sound');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  expect((await ghost(page))!.title).toBe('Sound');
  expect(await heading(page)).toBe('Options');
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
  expect(await heading(page)).toBe('Sound');

  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'invoked', progress: 1 });
  expect((await state(page)).sub).toBe('options');
  expect(await heading(page)).toBe('Options');
  expect(await ghost(page)).toBeNull();

  // Options over the pause menu peeks onto the pause menu.
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  expect(await heading(page)).toBe('Paused');
  await emit(page, { type: 'invoked', progress: 1 });
  expect((await state(page)).sub).toBeNull();
  expect((await state(page)).screen).toBe('pause');
  expect(await heading(page)).toBe('Paused');
  expect(errors).toEqual([]);
});

test('the Controls table over the title peeks onto the title menu', async ({ page }) => {
  await open(page, 'title');
  await show(page, 'controls');
  expect((await state(page)).sub).toBe('controls');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  const g = (await ghost(page))!;
  expect(g.x).toBeGreaterThan(0);
  expect(await page.locator('#title:not(.peek-ghost) > .menu').isVisible()).toBe(true);
  await emit(page, { type: 'cancelled' });
  await expect.poll(() => ghost(page)).toBeNull();
  expect(await page.locator('#title > #controls').isVisible()).toBe(true);
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'invoked', progress: 1 });
  expect((await state(page)).sub).toBeNull();
  expect(await page.locator('#title > .menu').isVisible()).toBe(true);
});

test('the title menu itself has no peek', async ({ page }) => {
  await open(page, 'title');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  expect(await ghost(page)).toBeNull();
  expect(await visible(page, '#title')).toBe(true);
});

test('a gesture that never ends lets go by itself', async ({ page }) => {
  await open(page, 'pause');
  await emit(page, { type: 'started', swipeEdge: 'left' });
  await emit(page, { type: 'progress', progress: 0.5, swipeEdge: 'left' });
  expect(await ghost(page)).not.toBeNull();
  await expect.poll(() => ghost(page), { timeout: 6000 }).toBeNull();
  expect(await heading(page)).toBe('Paused');
  expect(await visible(page, '#overlay')).toBe(true);
});
