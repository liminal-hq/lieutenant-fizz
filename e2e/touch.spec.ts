// Browser checks of the on-screen touch controls on a landscape phone, from size to switching device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { audit } from './audit';

const RIGHT = 2;
const DOWN = 8;
const JUMP = 16;

interface Circle {
  cx: number;
  cy: number;
  r: number;
}
interface Placed {
  hit: Record<string, unknown>;
  face: Record<'dpad' | 'jump' | 'pogo' | 'fire' | 'pause', Circle>;
}
interface Lf {
  debugShow(s: string): void;
  debugState: {
    screen: string;
    px: number;
    py: number;
    pogo: number;
    ammo: number;
    bits: number;
    touch: boolean;
  };
  debugTouch: Placed | null;
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;
const state = (page: Page): Promise<Lf['debugState']> => lf(page, (g) => g.debugState);
const placed = async (page: Page): Promise<Placed> => {
  const p = await lf(page, (g) => g.debugTouch);
  if (!p) throw new Error('the touch controls are not showing');
  return p;
};

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
}

/** Opens Crater Fields with the controls pinned on (the `?touch` flag), as a phone shows it. */
async function play(page: Page, show: 'play' | 'map' = 'play'): Promise<void> {
  await ready(page, '/?debug&touch');
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), show);
  await expect(page.locator('#touch')).toBeVisible();
  await page.waitForTimeout(400);
}

/** Sends touch events through the DevTools protocol, so several fingers can be held at once. */
async function touchSession(page: Page): Promise<{
  start(points: Point[]): Promise<void>;
  move(points: Point[]): Promise<void>;
  end(points?: Point[]): Promise<void>;
}> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  return {
    start: async (points) => void (await send('touchStart', points)),
    move: async (points) => void (await send('touchMove', points)),
    end: async (points = []) => void (await send('touchEnd', points)),
  };
}
interface Point {
  x: number;
  y: number;
  id: number;
}

const box = (page: Page, selector: string): Promise<DOMRect[]> =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().toJSON()),
    selector,
  );

test('turns on from a first touch, with no flag', async ({ page }) => {
  await ready(page, '/?debug');
  await page.touchscreen.tap(400, 200);
  await expect.poll(() => state(page).then((s) => s.touch)).toBe(true);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#hud.pills')).toBeVisible();
  await expect(page.locator('#panelBtn')).toBeHidden();
});

test('every control is at least 48 dp', async ({ page }) => {
  await play(page);
  for (const r of await box(page, '#touch [data-control]')) {
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(47.9);
  }
  const p = await placed(page);
  for (const id of ['jump', 'pogo', 'fire'] as const) {
    expect(p.face[id].r * 2, id).toBeGreaterThanOrEqual(47.9);
  }
});

test('controls and pills stay inside the safe area while the game fills the screen', async ({
  page,
}) => {
  await play(page);
  const insets = { top: 0, right: 32, bottom: 20, left: 48 };
  await page.addStyleTag({
    content: `:root { --lf-safe-left: ${insets.left}px; --lf-safe-right: ${insets.right}px; --lf-safe-bottom: ${insets.bottom}px; }`,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const inside = (r: DOMRect): boolean =>
    r.left >= insets.left - 0.5 &&
    r.right <= w - insets.right + 0.5 &&
    r.top >= insets.top - 0.5 &&
    r.bottom <= h - insets.bottom + 0.5;
  for (const r of await box(page, '#touch [data-control]'))
    expect(inside(r), JSON.stringify(r)).toBe(true);
  for (const r of await box(page, '#hud .pill'))
    expect(r.left, 'pills clear the left inset').toBeGreaterThanOrEqual(insets.left);
  // The game itself still draws under the inset.
  const gl = (await box(page, '#gl canvas'))[0]!;
  expect([gl.width, gl.height]).toEqual([w, h]);
});

test('controls, pills and Pause do not overlap, and the faces keep 8 px apart', async ({
  page,
}) => {
  await play(page);
  const rects = [...(await box(page, '#touch [data-control]')), ...(await box(page, '#hud .pill'))];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap =
        Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
        Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
      expect(overlap, `${i} and ${j}`).toBe(false);
    }
  }
  const faces = await box(page, '#touch .face');
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i]!;
      const b = faces[j]!;
      const gap =
        Math.hypot(
          a.x + a.width / 2 - (b.x + b.width / 2),
          a.y + a.height / 2 - (b.y + b.height / 2),
        ) -
        a.width / 2 -
        b.width / 2;
      expect(gap, `${i} and ${j}`).toBeGreaterThanOrEqual(7.5);
    }
  }
});

test('the play screen passes the layout audit, controls included', async ({ page }) => {
  await play(page);
  const report = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  const { checked, ...problems } = report;
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
  });
});

test('moving and jumping work together', async ({ page }) => {
  await play(page);
  const p = await placed(page);
  const t = await touchSession(page);
  const before = await state(page);
  const pad: Point = { id: 1, x: p.face.dpad.cx + p.face.dpad.r * 0.7, y: p.face.dpad.cy };
  const jump: Point = { id: 2, x: p.face.jump.cx, y: p.face.jump.cy };
  await t.start([pad]);
  await t.start([pad, jump]);
  await page.waitForTimeout(250);
  const held = await state(page);
  expect(held.bits & (RIGHT | JUMP)).toBe(RIGHT | JUMP);
  expect(held.px).toBeGreaterThan(before.px);
  await t.end();
  await expect.poll(() => state(page).then((x) => x.bits)).toBe(0);
});

test('the D-pad rolls from one arm to another without lifting', async ({ page }) => {
  await play(page);
  const p = await placed(page);
  const t = await touchSession(page);
  const d = p.face.dpad;
  await t.start([{ id: 1, x: d.cx + d.r * 0.7, y: d.cy }]);
  await page.waitForTimeout(150);
  expect((await state(page)).bits & RIGHT).toBe(RIGHT);
  await t.move([{ id: 1, x: d.cx, y: d.cy + d.r * 0.7 }]);
  await page.waitForTimeout(150);
  const bits = (await state(page)).bits;
  expect(bits & DOWN).toBe(DOWN);
  expect(bits & RIGHT).toBe(0);
  await t.end();
});

test('a Pogo tap toggles pogo and lights the button', async ({ page }) => {
  await play(page);
  const { pogo } = (await placed(page)).face;
  await page.touchscreen.tap(pogo.cx, pogo.cy);
  await expect.poll(() => state(page).then((s) => s.pogo)).toBe(1);
  await expect(page.locator('#touch [data-control="pogo"]')).toHaveClass(/lit/);
  await page.waitForTimeout(150);
  await page.touchscreen.tap(pogo.cx, pogo.cy);
  await expect.poll(() => state(page).then((s) => s.pogo)).toBe(0);
  await expect(page.locator('#touch [data-control="pogo"]')).not.toHaveClass(/lit/);
});

test('Fizz shows the ammo and a tap fires', async ({ page }) => {
  await play(page);
  const { fire } = (await placed(page)).face;
  const start = (await state(page)).ammo;
  await expect(page.locator('#touch .count')).toHaveText(String(start));
  await page.touchscreen.tap(fire.cx, fire.cy);
  await expect.poll(() => state(page).then((s) => s.ammo)).toBe(start - 1);
  await expect(page.locator('#touch .count')).toHaveText(String(start - 1));
});

test('Pause opens the pause menu, which keeps the controls up for the menu', async ({ page }) => {
  await play(page);
  const { pause } = (await placed(page)).face;
  await page.touchscreen.tap(pause.cx, pause.cy);
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('pause');
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#touch [data-control="fire"]')).toBeHidden();
});

test('turning the phone upright pauses and shows Rotate, and landscape leaves it paused', async ({
  page,
}) => {
  await play(page);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate')).toBeVisible();
  expect((await state(page)).screen).toBe('pause');
  const report = await page.evaluate(audit, { roots: ['#rotate'] });
  expect(report.badSize).toEqual([]);
  await page.setViewportSize(size);
  await expect(page.locator('#rotate')).toBeHidden();
  expect((await state(page)).screen).toBe('pause');
});

test('the map has the controls too, and the D-pad walks', async ({ page }) => {
  await play(page, 'map');
  await expect(page.locator('#touch')).toBeVisible();
  const p = await placed(page);
  const t = await touchSession(page);
  const before = await state(page);
  await t.start([{ id: 1, x: p.face.dpad.cx + p.face.dpad.r * 0.7, y: p.face.dpad.cy }]);
  await page.waitForTimeout(500);
  await t.end();
  expect((await state(page)).px).toBeGreaterThan(before.px);
});

test('follows the device in use: a key hides the controls, a touch brings them back', async ({
  page,
}) => {
  await ready(page, '/?debug');
  await page.touchscreen.tap(400, 200);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#touch')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#touch')).toBeHidden();
  await expect(page.locator('#hud.pills')).toHaveCount(0);
  await expect(page.locator('#panelBtn')).toBeVisible();
  await page.touchscreen.tap(400, 200);
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#hud.pills')).toBeVisible();
});

test('?touch pins the controls on, whatever device is used', async ({ page }) => {
  await play(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await expect(page.locator('#touch')).toBeVisible();
  expect((await state(page)).touch).toBe(true);
});
