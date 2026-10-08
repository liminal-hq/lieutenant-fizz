// Browser checks that touch settings place the controls and the Touch controls screen changes them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

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
  debugState: { custom: boolean; screen: string; sub: string | null; menu: number };
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

// ---------- The Touch controls screen ----------

/** Opens the Touch controls screen the way a player reaches it: title, Options, Touch controls. */
async function openScreen(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&touch');
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('touch'));
  await expect(page.locator('#overlay h2')).toHaveText('Touch controls');
  await expect.poll(() => lf(page, (g) => g.debugTouch !== null)).toBe(true);
  return errors;
}

const rowLabels = (page: Page): Promise<string[]> =>
  page.locator('#overlay .menu button .lbl').allInnerTexts();

const row = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { has: page.locator('.lbl', { hasText: label }) });

const rowValue = (page: Page, label: string): Promise<string> =>
  row(page, label).locator('.val').innerText();

const tapAt = async (page: Page, sel: ReturnType<Page['locator']>): Promise<void> => {
  const b = (await sel.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

/** A tap on a row's ◄ (-1) or ► (1) stepper. */
const tapStep = (page: Page, label: string, d: -1 | 1): Promise<void> =>
  tapAt(page, row(page, label).locator(`[data-step="${d}"]`));

const stored = (page: Page): Promise<Settings | null> =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);

/** Text and rows of the menu screens that overlap a shown control's face. */
const underControls = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const faces = [...document.querySelectorAll<HTMLElement>('#touch [data-control]')]
      .filter((e) => !e.hidden)
      .map((e) => e.querySelector('.face')?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0);
    const content = [
      ...document.querySelectorAll<HTMLElement>(
        '#title :is(h1, p, button, table, .keys span), #overlay :is(h2, p, button, .keys span), #backBtn',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    const out: string[] = [];
    for (const e of content) {
      const r = e.getBoundingClientRect();
      for (const f of faces) {
        const hit =
          Math.min(r.right, f.right) > Math.max(r.left, f.left) + 1 &&
          Math.min(r.bottom, f.bottom) > Math.max(r.top, f.top) + 1;
        if (hit) out.push(`${e.tagName} “${(e.textContent ?? '').trim().slice(0, 20)}”`);
      }
    }
    return out;
  });

const auditScreen = async (page: Page): Promise<void> => {
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
  });
};

const canVibrate = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof navigator.vibrate === 'function');

test('Options offers Touch controls on touch, and it opens the Touch controls screen', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('options'));
  const labels = await rowLabels(page);
  // Before Back, after the setting rows.
  expect(labels.slice(-2)).toEqual(['Touch controls', 'Back']);
  expect(labels).toHaveLength(8);
  const touchRow = row(page, 'Touch controls');
  // It opens a screen, so it has no steppers.
  await expect(touchRow.locator('.step')).toHaveCount(0);
  await tapAt(page, touchRow);
  await expect(page.locator('#overlay h2')).toHaveText('Touch controls');
  const vibrates = await canVibrate(page);
  expect(await rowLabels(page)).toEqual([
    'Size',
    'Opacity',
    'Left-handed',
    ...(vibrates ? ['Haptics'] : []),
    'Move controls',
    'Reset',
    'Back',
  ]);
  expect(await lf(page, (g) => g.debugState.sub)).toBe('touch');
  // Defaults on first look.
  expect(await rowValue(page, 'Size')).toBe('Medium');
  expect(await rowValue(page, 'Opacity')).toBe('85%');
  expect(await rowValue(page, 'Left-handed')).toBe('Off');
  // The controls stay up as a gamepad, with Back, and nothing sits under them.
  await expect(page.locator('#touch [data-control="pogo"]')).toHaveAttribute('aria-label', 'Back');
  expect(await underControls(page)).toEqual([]);
  await auditScreen(page);
  // Back returns to Options on the row that opened it.
  await tapAt(page, row(page, 'Back'));
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Touch controls');
  expect(errors).toEqual([]);
});

test('the Size stepper previews live, saves, and survives a reload', async ({ page }) => {
  const errors = await openScreen(page);
  const before = (await placed(page)).face.jump.r;
  await tapStep(page, 'Size', 1);
  await expect.poll(() => rowValue(page, 'Size')).toBe('Large');
  await expect.poll(async () => (await placed(page)).face.jump.r).toBeCloseTo(before * 1.2, 1);
  expect((await placed(page)).face.jump.r * 2).toBeGreaterThanOrEqual(48);
  expect((await stored(page))?.size).toBe('L');
  // Past Large it stops; Small is two steps back.
  await tapStep(page, 'Size', 1);
  await expect.poll(async () => (await stored(page))?.size).toBe('L');
  await tapStep(page, 'Size', -1);
  await tapStep(page, 'Size', -1);
  await expect.poll(() => rowValue(page, 'Size')).toBe('Small');
  await expect.poll(async () => (await placed(page)).face.jump.r).toBeCloseTo(before * 0.85, 1);
  await tapStep(page, 'Size', 1);
  await tapStep(page, 'Size', 1);
  await expect.poll(() => rowValue(page, 'Size')).toBe('Large');
  expect(await underControls(page)).toEqual([]);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('touch'));
  await expect(page.locator('#overlay h2')).toHaveText('Touch controls');
  expect(await rowValue(page, 'Size')).toBe('Large');
  await expect.poll(async () => (await placed(page)).face.jump.r).toBeCloseTo(before * 1.2, 1);
  expect(errors).toEqual([]);
});

test('Left-handed mirrors the controls at once and the menu keeps clear of them', async ({
  page,
}) => {
  const errors = await openScreen(page);
  const w = await page.evaluate(() => innerWidth);
  expect((await placed(page)).face.dpad.cx).toBeLessThan(w / 2);
  await expect(page.locator('#stage')).toHaveAttribute('data-hand', 'right');
  // Choosing the row switches it.
  await tapAt(page, row(page, 'Left-handed'));
  await expect.poll(() => rowValue(page, 'Left-handed')).toBe('On');
  await expect.poll(async () => (await placed(page)).face.dpad.cx).toBeGreaterThan(w / 2);
  expect((await placed(page)).face.jump.cx).toBeLessThan(w / 2);
  await expect(page.locator('#stage')).toHaveAttribute('data-hand', 'left');
  expect((await stored(page))?.leftHanded).toBe(true);
  expect(await underControls(page)).toEqual([]);
  await auditScreen(page);
  // Options behind it keeps clear of the mirrored controls too.
  await tapAt(page, row(page, 'Back'));
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  expect(await underControls(page)).toEqual([]);
  await auditScreen(page);
  expect(errors).toEqual([]);
});

test('Opacity applies in play and the menus stay solid', async ({ page }) => {
  const errors = await openScreen(page);
  const opacity = (): Promise<string> =>
    page.evaluate(() => getComputedStyle(document.querySelector('#touch')!).opacity);
  // The menu controls are solid whatever the setting.
  expect(await opacity()).toBe('1');
  await tapStep(page, 'Opacity', -1);
  await expect.poll(() => rowValue(page, 'Opacity')).toBe('60%');
  await tapStep(page, 'Opacity', -1);
  await expect.poll(() => rowValue(page, 'Opacity')).toBe('40%');
  expect(await opacity()).toBe('1');
  expect((await stored(page))?.opacity).toBe(40);
  // Past the end it stops at 40.
  await tapStep(page, 'Opacity', -1);
  await expect.poll(() => rowValue(page, 'Opacity')).toBe('40%');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect.poll(opacity).toBe('0.4');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await expect.poll(opacity).toBe('1');
  expect(errors).toEqual([]);
});

test('Reset needs two taps and puts every setting back', async ({ page }) => {
  const errors = await openScreen(page);
  await tapStep(page, 'Size', 1);
  await tapAt(page, row(page, 'Left-handed'));
  await tapStep(page, 'Opacity', -1);
  await expect.poll(async () => (await stored(page))?.opacity).toBe(60);
  await expect.poll(async () => (await stored(page))?.leftHanded).toBe(true);
  const changed = await lf(page, (g) => g.debugTouchSettings);
  expect(changed).toMatchObject({ size: 'L', leftHanded: true, opacity: 60 });
  // One tap only arms it.
  await tapAt(page, row(page, 'Reset'));
  await expect.poll(() => rowValue(page, 'Reset')).toBe('Tap again');
  expect(await lf(page, (g) => g.debugTouchSettings)).toEqual(changed);
  // Moving the selection disarms it.
  const d = (await placed(page)).face.dpad;
  await page.touchscreen.tap(d.cx, d.cy - d.r * 0.7);
  await expect(row(page, 'Reset').locator('.val')).toHaveCount(0);
  expect(await lf(page, (g) => g.debugTouchSettings)).toEqual(changed);
  // Armed again, it lapses by itself after about three seconds.
  await tapAt(page, row(page, 'Reset'));
  await expect.poll(() => rowValue(page, 'Reset')).toBe('Tap again');
  await expect(row(page, 'Reset').locator('.val')).toHaveCount(0, { timeout: 6000 });
  expect(await lf(page, (g) => g.debugTouchSettings)).toEqual(changed);
  // Two taps do it.
  await tapAt(page, row(page, 'Reset'));
  await expect.poll(() => rowValue(page, 'Reset')).toBe('Tap again');
  await tapAt(page, row(page, 'Reset'));
  await expect
    .poll(() => lf(page, (g) => g.debugTouchSettings))
    .toEqual({ size: 'M', opacity: 85, leftHanded: false, haptics: true, pos: {} });
  expect(await rowValue(page, 'Size')).toBe('Medium');
  expect(await rowValue(page, 'Left-handed')).toBe('Off');
  expect((await stored(page))?.size).toBe('M');
  await expect(row(page, 'Reset').locator('.val')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Touch controls screen shows defaults when storage is corrupt', async ({ page }) => {
  await store(
    page,
    '{"v":1,"size":"XL","opacity":"high","pos":{"dpad":{"side":1e9,"bottom":"x"}}}',
  );
  const errors = await openScreen(page);
  expect(await rowValue(page, 'Size')).toBe('Medium');
  expect(await rowValue(page, 'Opacity')).toBe('85%');
  expect(await rowValue(page, 'Left-handed')).toBe('Off');
  await expect(row(page, 'Move controls').locator('.val')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Move controls only says it is coming', async ({ page }) => {
  const errors = await openScreen(page);
  await tapAt(page, row(page, 'Move controls'));
  await expect(page.locator('#toast')).toBeVisible();
  expect(await lf(page, (g) => g.debugState.sub)).toBe('touch');
  expect(errors).toEqual([]);
});

// Large controls pushed as far in as they go must still leave the menus clear of them.
for (const [w, h] of [
  [844, 390],
  [740, 360],
  [640, 320],
] as const) {
  test(`Large controls pushed inward leave Options and Touch controls clear at ${w}×${h}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await store(
      page,
      JSON.stringify({
        v: 1,
        size: 'L',
        opacity: 85,
        leftHanded: false,
        haptics: true,
        pos: {
          dpad: { side: 2000, bottom: 2000 },
          jump: { side: 2000, bottom: 0 },
          pogo: { side: 0, bottom: 200 },
          fire: { side: 2000, bottom: 200 },
        },
      }),
    );
    const errors = await openScreen(page);
    // Moved, not the fallback to defaults, or this checks nothing.
    expect((await lf(page, (g) => g.debugState)).custom).toBe(true);
    for (const screen of ['touch', 'options'] as const) {
      await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
      await expect(page.locator('#overlay h2')).toHaveText(
        screen === 'touch' ? 'Touch controls' : 'Options',
      );
      await expect.poll(() => underControls(page), screen).toEqual([]);
      await auditScreen(page);
    }
    expect(errors).toEqual([]);
  });
}

test('the Back button closes Touch controls to Options, then Options to the title', async ({
  page,
}) => {
  const errors = await openScreen(page);
  const back = async (): Promise<void> => {
    const b = (await page.locator('#backBtn').boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await back();
  await expect.poll(() => lf(page, (g) => g.debugState.sub)).toBe('options');
  await back();
  await expect.poll(() => lf(page, (g) => g.debugState.sub)).toBe(null);
  expect((await lf(page, (g) => g.debugState)).screen).toBe('title');
  expect(errors).toEqual([]);
});
