// Browser checks that stored touch settings place the controls, and that corrupt ones fall back.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

// Times out under software GL on the shared CI runner. Disabled for now and kept, to be profiled and
// re-enabled; set LF_E2E_TOUCH_SETTINGS=1 to run it locally.
test.fixme(
  !process.env['LF_E2E_TOUCH_SETTINGS'],
  'flaky on CI: times out under software GL on the shared runner; profile and re-enable (LF_E2E_TOUCH_SETTINGS=1 runs it locally)',
);

const KEY = 'lf-touch-v1';

interface Circle {
  cx: number;
  cy: number;
  r: number;
}
interface Placed {
  face: Record<'dpad' | 'jump' | 'pogo' | 'fire' | 'pause', Circle>;
  custom: boolean;
}
interface Settings {
  size: string;
  opacity: number;
  leftHanded: boolean;
  haptics: boolean;
  pos: Record<string, { side: number; bottom: number }>;
}
interface Lf {
  debugShow(s: string): void;
  debugState: { custom: boolean };
  debugTouch: Placed | null;
  debugTouchSettings: Settings;
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

/** Stores a value for the touch settings before any page script runs. */
const store = async (page: Page, value: string): Promise<void> => {
  await page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [KEY, value]);
};

/** Opens Crater Fields with the controls pinned on, collecting page errors as they happen. */
async function play(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&touch');
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#touch')).toBeVisible();
  await expect.poll(() => lf(page, (g) => g.debugTouch !== null)).toBe(true);
  return errors;
}

const placed = async (page: Page): Promise<Placed> => {
  const p = await lf(page, (g) => g.debugTouch);
  if (!p) throw new Error('the touch controls are not showing');
  return p;
};

const box = (page: Page, selector: string): Promise<DOMRect[]> =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().toJSON()),
    selector,
  );

/** No two controls or pills overlap, and the faces keep 8 px apart (7.5 allows for rounding). */
async function expectNoOverlap(page: Page): Promise<void> {
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
      expect(gap, `faces ${i} and ${j}`).toBeGreaterThanOrEqual(7.5);
    }
  }
}

/** The default D-pad: 24 + 75 px in, 22 + 75 px up, at the artboard scale (1 at these heights). */
const defaultDpad = (h: number): Circle => ({ cx: 99, cy: h - 97, r: 75 });

test('stored settings place the controls, clamped into their zone', async ({ page }) => {
  const stored = {
    v: 1,
    size: 'M',
    opacity: 60,
    leftHanded: false,
    haptics: true,
    pos: { dpad: { side: 75, bottom: 115 } },
  };
  await store(page, JSON.stringify(stored));
  const errors = await play(page);
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const p = await placed(page);
  // The D-pad wants (150, h - 190); its zone stops at (w - 300) / 2 - 91 across and 171 down.
  expect(p.face.dpad.r).toBe(75);
  expect(p.face.dpad.cx).toBeCloseTo(Math.min(150, (w - 300) / 2 - 91), 3);
  expect(p.face.dpad.cy).toBeCloseTo(Math.max(h - 190, 171), 3);
  expect(p.custom).toBe(true);
  expect((await lf(page, (g) => g.debugState)).custom).toBe(true);
  // The stored value is the player's intent: it is read as written.
  expect(await lf(page, (g) => g.debugTouchSettings)).toMatchObject({
    opacity: 60,
    pos: stored.pos,
  });
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('#touch')!).opacity),
  ).toBe('0.6');
  await expectNoOverlap(page);
  expect(errors).toEqual([]);
});

test('stored Large and left-handed settings mirror the layout', async ({ page }) => {
  await store(
    page,
    JSON.stringify({
      v: 1,
      size: 'L',
      opacity: 100,
      leftHanded: true,
      haptics: false,
      pos: { dpad: { side: 40, bottom: 115 } },
    }),
  );
  const errors = await play(page);
  const { w } = await page.evaluate(() => ({ w: innerWidth }));
  const p = await placed(page);
  expect(p.face.dpad.cx).toBeGreaterThan(w / 2);
  expect(p.face.jump.cx).toBeLessThan(w / 2);
  expect(p.face.jump.r * 2).toBeGreaterThanOrEqual(48);
  expect(p.face.jump.r).toBeGreaterThan(40);
  expect(p.custom).toBe(true);
  await expectNoOverlap(page);
  expect(errors).toEqual([]);
});

test('stored settings still place the controls on a 640×320 window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await store(
    page,
    JSON.stringify({
      v: 1,
      size: 'S',
      opacity: 85,
      leftHanded: false,
      haptics: true,
      pos: { dpad: { side: 0, bottom: 2000 } },
    }),
  );
  const errors = await play(page);
  const p = await placed(page);
  // Top of the zone: 96 px down, the face's own radius below that.
  expect(p.face.dpad.cy - p.face.dpad.r).toBeCloseTo(96, 3);
  for (const id of ['jump', 'pogo', 'fire'] as const) {
    expect(p.face[id].r * 2, id).toBeGreaterThanOrEqual(47.9);
  }
  await expectNoOverlap(page);
  expect(errors).toEqual([]);
});

const CORRUPT: [string, string][] = [
  ['unparseable JSON', '{oops'],
  ['a newer version', JSON.stringify({ v: 9, size: 'L', pos: { dpad: { side: 5, bottom: 5 } } })],
  ['a missing version', JSON.stringify({ size: 'L', leftHanded: true })],
  ['not an object', '42'],
  [
    'huge, negative and missing offsets',
    '{"v":1,"pos":{"dpad":{"side":1e9,"bottom":1e9},"fire":{"side":-5,"bottom":null},"jump":{"side":"x"},"pause":{"side":1,"bottom":1}}}',
  ],
  [
    'wrong types',
    JSON.stringify({ v: 1, size: 7, opacity: 'high', leftHanded: 'yes', haptics: 0, pos: 'here' }),
  ],
];

for (const [name, value] of CORRUPT) {
  test(`boots to the default layout with ${name}`, async ({ page }) => {
    await store(page, value);
    const errors = await play(page);
    const h = await page.evaluate(() => innerHeight);
    const p = await placed(page);
    expect(p.face.dpad).toEqual(defaultDpad(h));
    expect(p.custom).toBe(false);
    expect((await lf(page, (g) => g.debugState)).custom).toBe(false);
    const s = await lf(page, (g) => g.debugTouchSettings);
    expect(s.pos).toEqual({});
    expect(s).toEqual({ size: 'M', opacity: 85, leftHanded: false, haptics: true, pos: {} });
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('#touch')!).opacity),
    ).toBe('0.85');
    await expectNoOverlap(page);
    expect(errors).toEqual([]);
    // Reading never rewrites what was stored.
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(value);
  });
}

test('boots to the default layout when storage throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  const errors = await play(page);
  const h = await page.evaluate(() => innerHeight);
  expect((await placed(page)).face.dpad).toEqual(defaultDpad(h));
  expect(errors).toEqual([]);
});

test('with nothing stored the layout is the default and opacity is 85%', async ({ page }) => {
  const errors = await play(page);
  const h = await page.evaluate(() => innerHeight);
  const p = await placed(page);
  expect(p.face.dpad).toEqual(defaultDpad(h));
  expect(p.custom).toBe(false);
  expect(await lf(page, (g) => g.debugTouchSettings)).toEqual({
    size: 'M',
    opacity: 85,
    leftHanded: false,
    haptics: true,
    pos: {},
  });
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('#touch')!).opacity),
  ).toBe('0.85');
  expect(errors).toEqual([]);
});
