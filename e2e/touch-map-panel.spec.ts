// Browser checks that the map's level panel docks away from Ben on a landscape phone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Anchor {
  x: number;
  y: number;
  ppu: number;
}
interface Lf {
  debugShow(s: string): void;
  debugState: { screen: string; ben: Anchor | null };
  sim: { set(i: number, v: number): void };
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EDGE = 8;

/** Where the level nodes and the first sign are on the map, in world units. */
const SPOTS = {
  crater: { x: 14, y: 6, title: 'Crater Fields' },
  marshmallow: { x: 5, y: 30, title: 'Marshmallow Meadows' },
  sugar: { x: 51, y: 30, title: 'Sugar Glass Gallery' },
  sign: { x: 17, y: 6, title: 'Sign' },
} as const;

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

/** Opens the map with the controls pinned on, with game audio muted by the launch flags. */
async function openMap(page: Page, hand: 'right' | 'left' = 'right'): Promise<void> {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k!, v!),
    [
      'lf-touch-v1',
      JSON.stringify({
        v: 1,
        size: 'M',
        opacity: 85,
        leftHanded: hand === 'left',
        hapticStrength: 2,
        pos: {},
      }),
    ],
  );
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
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
  await lf(page, (g) => g.debugShow('map'));
  await expect(page.locator('#touch')).toBeVisible();
}

/** Puts Ben at a spot and waits for the camera to settle, the panel to show its title and be docked. */
async function goTo(page: Page, spot: keyof typeof SPOTS): Promise<void> {
  const s = SPOTS[spot];
  await page.evaluate(
    ([x, y]) => {
      const g = (window as unknown as { __lf: Lf }).__lf;
      g.debugShow('map');
      // State slots 13 and 14 are Ben's x and y.
      g.sim.set(13, x!);
      g.sim.set(14, y!);
      (window as unknown as { __last: string }).__last = '';
    },
    [s.x, s.y],
  );
  await page.waitForFunction(
    (title) => {
      const p = document.querySelector<HTMLElement>('#prompt');
      if (!p || p.hidden || !p.dataset['dock'] || p.dataset['dock'] === 'pending') return false;
      if (!p.querySelector('.t')?.textContent?.startsWith(title)) return false;
      // The camera eases towards Ben, so wait until he has stopped moving on screen.
      const b = (window as unknown as { __lf: Lf }).__lf.debugState.ben;
      const w = window as unknown as { __last: string };
      const now = b ? `${b.x.toFixed(1)},${b.y.toFixed(1)}` : '';
      const same = now === w.__last;
      w.__last = now;
      return same && now !== '';
    },
    s.title,
    { polling: 'raf', timeout: 20_000 },
  );
}

interface Seen {
  card: Box;
  side: string;
  tier: string;
  ben: Box;
  benCentre: number;
  controls: Box[];
  hud: Box;
  pause: Box;
  view: { w: number; h: number };
  pointer: string;
}

const seen = (page: Page): Promise<Seen> =>
  page.evaluate(() => {
    const g = (window as unknown as { __lf: Lf }).__lf;
    const box = (r: DOMRect): { x: number; y: number; w: number; h: number } => ({
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    });
    const p = document.querySelector<HTMLElement>('#prompt')!;
    const b = g.debugState.ben!;
    const s = 1.3 * b.ppu;
    const controls = [...document.querySelectorAll<HTMLElement>('#touch [data-control]')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .map((e) => box(e.getBoundingClientRect()));
    return {
      card: box(p.getBoundingClientRect()),
      side: p.dataset['dock']!,
      tier: p.dataset['dockTier']!,
      ben: { x: b.x - s / 2, y: b.y - s / 2, w: s, h: s },
      benCentre: b.x,
      controls,
      hud: box(document.querySelector('#hud')!.getBoundingClientRect()),
      pause: box(
        document.querySelector('#touch [data-control="pause"] .face')!.getBoundingClientRect(),
      ),
      view: { w: window.innerWidth, h: window.innerHeight },
      pointer: getComputedStyle(p).pointerEvents,
    };
  });

const hits = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Everything the card must not cover, when it found a place clear of the control faces (tier 1 or 2). */
function expectClear(s: Seen, strict: boolean): void {
  expect(hits(s.card, s.ben), 'covers Ben').toBe(false);
  expect(hits(s.card, s.hud), 'covers the pills').toBe(false);
  expect(hits(s.card, s.pause), 'covers Pause').toBe(false);
  expect(s.card.x).toBeGreaterThanOrEqual(EDGE - 0.5);
  expect(s.card.x + s.card.w).toBeLessThanOrEqual(s.view.w - EDGE + 0.5);
  expect(s.card.y).toBeGreaterThanOrEqual(EDGE - 0.5);
  expect(s.card.y + s.card.h).toBeLessThanOrEqual(s.view.h - EDGE + 0.5);
  if (strict) for (const c of s.controls) expect(hits(s.card, c), 'covers a control').toBe(false);
  expect(s.pointer).toBe('none');
}

test('docks away from Ben, clear of him, the controls, the pills and Pause', async ({ page }) => {
  await openMap(page);
  await goTo(page, 'crater');
  const s = await seen(page);
  expect(Number(s.tier)).toBeLessThanOrEqual(2);
  expectClear(s, false);
  // The faces the player sees are kept clear; the hit areas also, unless the panel had to step over a margin.
  if (s.tier === '1') expectClear(s, true);
  // Ben is on the opposite side of the screen's middle.
  expect(s.side).toBe(s.benCentre < s.view.w / 2 ? 'right' : 'left');
  // Not the old centred panel.
  expect(s.card.w).toBeLessThan(s.view.w * 0.45);
});

test('flips sides as Ben crosses the middle of the screen', async ({ page }) => {
  await openMap(page);
  await goTo(page, 'marshmallow');
  const left = await seen(page);
  expect(left.benCentre).toBeLessThan(left.view.w / 2);
  expect(left.side).toBe('right');
  expectClear(left, false);
  await goTo(page, 'sugar');
  const right = await seen(page);
  expect(right.benCentre).toBeGreaterThan(right.view.w / 2);
  expect(right.side).toBe('left');
  expectClear(right, false);
});

test('mirrors for the left hand and still clears the controls', async ({ page }) => {
  await openMap(page, 'left');
  await goTo(page, 'crater');
  const s = await seen(page);
  expectClear(s, false);
  expect(Number(s.tier)).toBeLessThanOrEqual(2);
  await goTo(page, 'sugar');
  expectClear(await seen(page), false);
});

test('a sign shows all its text and stays clear of Ben', async ({ page }) => {
  await openMap(page);
  await goTo(page, 'sign');
  const s = await seen(page);
  expect(hits(s.card, s.ben), 'covers Ben').toBe(false);
  expect(s.card.y).toBeGreaterThanOrEqual(EDGE - 0.5);
  expect(s.card.y + s.card.h).toBeLessThanOrEqual(s.view.h - EDGE + 0.5);
  await expect(page.locator('#prompt .d')).toContainText('wipe your boots');
});

test('still clear of Ben at 640x320', async ({ page }) => {
  await openMap(page);
  await page.setViewportSize({ width: 640, height: 320 });
  await goTo(page, 'crater');
  const s = await seen(page);
  expect(Number(s.tier)).toBeLessThanOrEqual(2);
  expectClear(s, false);
  await goTo(page, 'sign');
  const long = await seen(page);
  // The longest text may step onto the top of a control, but never onto Ben or off the screen.
  expect(hits(long.card, long.ben), 'covers Ben').toBe(false);
  expect(long.card.y + long.card.h).toBeLessThanOrEqual(long.view.h - EDGE + 0.5);
});

test('clears the controls where they rise in an installed app and where they fall back', async ({
  page,
}) => {
  await openMap(page);
  await goTo(page, 'crater');
  const bars = await seen(page);
  expectClear(bars, false);
  // The default controls rise; the card is placed again against their new places.
  await page.evaluate(() =>
    (window as unknown as { __setStandalone(on: boolean): void }).__setStandalone(true),
  );
  await expect
    .poll(async () => (await seen(page)).controls[0]!.y, { timeout: 10_000 })
    .toBeLessThan(bars.controls[0]!.y - 20);
  await goTo(page, 'crater');
  const up = await seen(page);
  expectClear(up, false);
  if (up.tier === '1') expectClear(up, true);
  await page.evaluate(() =>
    (window as unknown as { __setStandalone(on: boolean): void }).__setStandalone(false),
  );
  await expect
    .poll(async () => (await seen(page)).controls[0]!.y, { timeout: 10_000 })
    .toBe(bars.controls[0]!.y);
  await goTo(page, 'crater');
  expectClear(await seen(page), false);
});
