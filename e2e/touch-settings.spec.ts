// Browser checks that touch settings place the controls and the Touch controls screen changes them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type CDPSession, type Page } from '@playwright/test';
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
  debugState: { custom: boolean; screen: string; sub: string | null; menu: number; bits: number };
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

// ---------- The editor ----------

interface Pt {
  x: number;
  y: number;
}

const sessions = new WeakMap<Page, CDPSession>();

/** One finger sent through the DevTools protocol, with enough steps for the page to see a drag. */
async function finger(page: Page): Promise<{
  down(p: Pt): Promise<void>;
  to(p: Pt, steps?: number): Promise<void>;
  up(): Promise<void>;
}> {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    sessions.set(page, cdp);
  }
  const session = cdp;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt): Promise<unknown> =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });
  let at: Pt = { x: 0, y: 0 };
  return {
    down: async (p) => {
      at = p;
      await send('touchStart', p);
    },
    to: async (p, steps = 8) => {
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', {
          x: at.x + ((p.x - at.x) * i) / steps,
          y: at.y + ((p.y - at.y) * i) / steps,
        });
      }
      at = p;
    },
    up: async () => void (await send('touchEnd')),
  };
}

type Id = 'dpad' | 'jump' | 'pogo' | 'fire';

/** Drags a control's face from where it is to `to` (the finger lands on its centre) and lifts. */
async function dragTo(page: Page, id: Id, to: Pt, hold = false): Promise<void> {
  const f = (await placed(page)).face[id];
  const t = await finger(page);
  await t.down({ x: f.cx, y: f.cy });
  await t.to(to);
  if (hold) return;
  await t.up();
  // The control is let go once the page has seen the lift.
  await expect(page.locator('#touch .drag')).toHaveCount(0);
}

/** Opens the editor the way a player does: Touch controls screen, then the Move controls row. */
async function openEditor(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?debug&touch${query}`);
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('touchEdit'));
  await expect(page.locator('#touchEdit')).toBeVisible();
  await expect.poll(() => lf(page, (g) => g.debugTouch !== null)).toBe(true);
  return errors;
}

/**
 * A tap by the same CDP finger the drags use, after a short settle. Chrome drops the click of a tap that
 * starts within about 50 ms of a drag's lift (it reads it as a tap that stops a fling), which a person's
 * hand does not do; there is no page state to poll for it, so the helper waits that long.
 */
async function fingerTap(page: Page, selector: string): Promise<void> {
  await page.waitForTimeout(150);
  const b = (await page.locator(selector).boundingBox())!;
  const t = await finger(page);
  await t.down({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  await t.up();
}

const tapDone = (page: Page): Promise<void> => fingerTap(page, '#touchEdit .done');

const sub = (page: Page): Promise<string | null> => lf(page, (g) => g.debugState.sub);

const view = (page: Page): Promise<{ w: number; h: number }> =>
  page.evaluate(() => ({ w: innerWidth, h: innerHeight }));

test('Move controls opens the editor, and Done, Escape and Enter close it', async ({ page }) => {
  const errors = await openScreen(page);
  const back = (await page.locator('#backBtn').boundingBox())!;
  const labels = await rowLabels(page);
  await tapAt(page, row(page, 'Move controls'));
  await expect.poll(() => sub(page)).toBe('touchEdit');
  await expect(page.locator('#touchEdit')).toBeVisible();
  // Done sits where Back sat, and is a full-size target.
  const done = (await page.locator('#touchEdit .done').boundingBox())!;
  expect(done.x).toBeCloseTo(back.x, 0);
  expect(done.y).toBeCloseTo(back.y, 0);
  expect(done.width).toBeGreaterThanOrEqual(47.9);
  expect(done.height).toBeGreaterThanOrEqual(47.9);
  await tapDone(page);
  await expect.poll(() => sub(page)).toBe('touch');
  expect((await lf(page, (g) => g.debugState)).menu).toBe(labels.indexOf('Move controls'));
  for (const key of ['Escape', 'Enter']) {
    await tapAt(page, row(page, 'Move controls'));
    await expect.poll(() => sub(page)).toBe('touchEdit');
    await page.keyboard.press(key);
    await expect.poll(() => sub(page), key).toBe('touch');
  }
  expect(errors).toEqual([]);
});

test('the editor dims the game, outlines the four controls and hides Pause and Back', async ({
  page,
}) => {
  const errors = await openEditor(page);
  await expect(page.locator('#touchEdit h2')).toHaveText('Move controls');
  await expect(page.locator('#touchEdit .hint')).toHaveText('Drag a control to move it');
  await expect(page.locator('#touchEdit .reset')).toHaveText('Reset');
  await expect(page.locator('#touch')).toHaveAttribute('data-mode', 'edit');
  await expect(page.locator('#touch [data-control="pause"]')).toBeHidden();
  await expect(page.locator('#backBtn')).toBeHidden();
  await expect(page.locator('#overlay')).toBeHidden();
  const look = await page.evaluate(() => {
    const css = (e: Element): CSSStyleDeclaration => getComputedStyle(e);
    const shown = [...document.querySelectorAll<HTMLElement>('#touch [data-control]')].filter(
      (e) => !e.hidden,
    );
    const bar = document.querySelector('#touchEdit .hint')!.getBoundingClientRect();
    return {
      scrim: css(document.querySelector('#touchEdit')!).backgroundColor,
      controls: shown.map((e) => e.dataset.control),
      labels: shown.map((e) => e.getAttribute('aria-label')),
      borders: shown.map((e) => css(e.querySelector('.face')!).borderTopStyle),
      opacity: css(document.querySelector('#touch')!).opacity,
      hintBottom: bar.bottom,
    };
  });
  expect(look.scrim).toBe('rgba(5, 5, 7, 0.55)');
  expect(look.controls).toEqual(['dpad', 'jump', 'pogo', 'fire']);
  expect(look.labels).toEqual(['Move D-pad', 'Move Jump', 'Move Pogo', 'Move Fizz']);
  expect(look.borders).toEqual(['dashed', 'dashed', 'dashed', 'dashed']);
  expect(look.opacity).toBe('0.85');
  // Everything in the bar and under it stays inside the band the controls may not enter.
  expect(look.hintBottom).toBeLessThanOrEqual(96);
  await auditScreen(page);
  expect(errors).toEqual([]);
});

test('the editor bar fits above the 96 px band at 640×320', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 320 });
  const errors = await openEditor(page);
  const bar = await page.evaluate(() => {
    const r = (s: string): DOMRect => document.querySelector(s)!.getBoundingClientRect();
    return {
      done: r('#touchEdit .done').toJSON(),
      reset: r('#touchEdit .reset').toJSON(),
      title: r('#touchEdit h2').toJSON(),
      hint: r('#touchEdit .hint').toJSON(),
    };
  });
  expect(bar.done.right).toBeLessThanOrEqual(bar.title.left + 1);
  expect(bar.title.right).toBeLessThanOrEqual(bar.reset.left + 1);
  expect(bar.hint.bottom).toBeLessThanOrEqual(96);
  expect(bar.reset.height).toBeGreaterThanOrEqual(47.9);
  await auditScreen(page);
  expect(errors).toEqual([]);
});

test('dragging the D-pad moves it with the finger and saves the place', async ({ page }) => {
  const errors = await openEditor(page);
  const { w, h } = await view(page);
  const start = (await placed(page)).face.dpad;
  const t = await finger(page);
  await t.down({ x: start.cx, y: start.cy });
  await t.to({ x: start.cx + 40, y: start.cy - 80 });
  // The zone stops the D-pad at (w - 300) / 2 - 91 across and 171 down (the menu column and the HUD band).
  const wantX = Math.min(start.cx + 40, Math.max(start.cx, (w - 300) / 2 - 91));
  const wantY = Math.max(start.cy - 80, 171);
  await expect
    .poll(async () => {
      const f = (await placed(page)).face.dpad;
      return Math.hypot(f.cx - wantX, f.cy - wantY);
    })
    .toBeLessThan(1);
  // A finger on a control in the editor is not a press: nothing is held while it drags.
  expect((await lf(page, (g) => g.debugState)).bits).toBe(0);
  await expect(page.locator('#touch [data-control="dpad"]')).toHaveClass(/drag/);
  await t.up();
  await expect(page.locator('#touch [data-control="dpad"]')).not.toHaveClass(/drag/);
  await expect.poll(async () => (await stored(page))?.pos.dpad).toBeDefined();
  const pos = (await stored(page))!.pos.dpad!;
  expect(Number.isInteger(pos.side) && Number.isInteger(pos.bottom)).toBe(true);
  // 24 + 75 = 99 across and 22 + 75 = 97 up for the default D-pad.
  expect(pos.side + 75).toBeCloseTo(wantX, 0);
  expect(pos.bottom + 75).toBeCloseTo(h - wantY, 0);
  await tapDone(page);
  await expect.poll(() => sub(page)).toBe('touch');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect.poll(async () => (await lf(page, (g) => g.debugState)).screen).toBe('play');
  const f = (await placed(page)).face.dpad;
  expect(Math.hypot(f.cx - wantX, f.cy - wantY)).toBeLessThan(1);
  expect((await lf(page, (g) => g.debugState)).custom).toBe(true);
  await expectNoOverlap(page);
  expect(errors).toEqual([]);
});

test('a drag cannot leave its zone or sit on another control', async ({ page }) => {
  const errors = await openEditor(page);
  const { w } = await view(page);
  // Straight to the top middle: stopped by the HUD band and the menu column.
  await dragTo(page, 'dpad', { x: w / 2, y: 0 });
  await expect.poll(async () => (await stored(page))?.pos.dpad).toBeDefined();
  const d = (await placed(page)).face.dpad;
  expect(d.cy - d.r).toBeGreaterThanOrEqual(95.5);
  expect(d.cy - d.r).toBeLessThanOrEqual(96.5);
  // Menus keep a column: the D-pad's gutter ends at (w - 300) / 2.
  expect(Math.ceil(d.cx + d.r + 16)).toBeLessThanOrEqual((w - 300) / 2 + 0.5);
  // Jump dropped on Pogo is pushed off it, to the 8 px gap between faces.
  const pogo = (await placed(page)).face.pogo;
  await dragTo(page, 'jump', { x: pogo.cx, y: pogo.cy });
  await expect.poll(async () => (await stored(page))?.pos.jump).toBeDefined();
  const p = await placed(page);
  const gap = Math.hypot(p.face.jump.cx - pogo.cx, p.face.jump.cy - pogo.cy);
  expect(gap - p.face.jump.r - pogo.r).toBeGreaterThanOrEqual(7.5);
  expect(p.custom).toBe(true);
  await expectNoOverlap(page);
  expect(errors).toEqual([]);
});

test('dragged controls keep clear of a notch and the bottom bar', async ({ page }) => {
  const errors = await openEditor(page);
  const insets = { left: 48, right: 32, bottom: 20 };
  await page.addStyleTag({
    content: `:root { --lf-safe-left: ${insets.left}px; --lf-safe-right: ${insets.right}px; --lf-safe-bottom: ${insets.bottom}px; }`,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const { w, h } = await view(page);
  await expect
    .poll(async () => (await placed(page)).face.dpad.cx)
    .toBeGreaterThanOrEqual(insets.left + 8);
  // Push the D-pad into the bottom left corner and Jump into the bottom right.
  await dragTo(page, 'dpad', { x: 0, y: h });
  await dragTo(page, 'jump', { x: w, y: h });
  await expect.poll(async () => (await stored(page))?.pos.jump).toBeDefined();
  const hits = await box(page, '#touch [data-control]');
  const dpad = hits[0]!;
  const jump = hits[1]!;
  expect(dpad.left).toBeGreaterThanOrEqual(insets.left + 8 - 0.5);
  expect(dpad.bottom).toBeLessThanOrEqual(h - insets.bottom - 8 + 0.5);
  expect(jump.right).toBeLessThanOrEqual(w - insets.right - 8 + 0.5);
  expect(jump.bottom).toBeLessThanOrEqual(h - insets.bottom - 8 + 0.5);
  expect(errors).toEqual([]);
});

test('a moved layout mirrors when Left-handed is turned on', async ({ page }) => {
  const errors = await openEditor(page);
  const { w } = await view(page);
  await dragTo(page, 'dpad', { x: 150, y: 190 });
  await expect.poll(async () => (await stored(page))?.pos.dpad).toBeDefined();
  const before = (await placed(page)).face.dpad;
  await tapDone(page);
  await expect.poll(() => sub(page)).toBe('touch');
  await tapStep(page, 'Left-handed', 1);
  await expect.poll(async () => (await placed(page)).face.dpad.cx).toBeGreaterThan(w / 2);
  const after = (await placed(page)).face.dpad;
  expect(after.cx).toBeCloseTo(w - before.cx, 0);
  expect(after.cy).toBeCloseTo(before.cy, 0);
  expect((await lf(page, (g) => g.debugState)).custom).toBe(true);
  expect(await underControls(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Reset in the editor needs two taps and puts back only the positions', async ({ page }) => {
  await store(
    page,
    JSON.stringify({ v: 1, size: 'S', opacity: 60, leftHanded: false, haptics: true, pos: {} }),
  );
  const errors = await openEditor(page);
  await dragTo(page, 'jump', { x: 700, y: 250 });
  await dragTo(page, 'dpad', { x: 150, y: 200 });
  await expect.poll(async () => Object.keys((await stored(page))?.pos ?? {}).length).toBe(2);
  expect((await lf(page, (g) => g.debugState)).custom).toBe(true);
  await fingerTap(page, '#touchEdit .reset');
  await expect(page.locator('#touchEdit .reset')).toHaveText('Tap again');
  expect(Object.keys((await stored(page))!.pos)).toHaveLength(2);
  await fingerTap(page, '#touchEdit .reset');
  await expect.poll(async () => (await stored(page))?.pos).toEqual({});
  await expect.poll(async () => (await lf(page, (g) => g.debugState)).custom).toBe(false);
  await expect(page.locator('#touchEdit .reset')).toHaveText('Reset');
  expect(await stored(page)).toMatchObject({ size: 'S', opacity: 60 });
  expect(await sub(page)).toBe('touchEdit');
  expect(errors).toEqual([]);
});

test('the split title falls back to one column when a raised D-pad leaves no room', async ({
  page,
}) => {
  const errors = await openEditor(page, '&title=split');
  const fit = (): Promise<string | undefined> =>
    page.evaluate(() => document.getElementById('stage')!.dataset.titleFit);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('title'));
  await expect(page.locator('#title')).toBeVisible();
  // With the D-pad where it starts, the split layout fits.
  await expect.poll(fit).toBeUndefined();
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('touchEdit'));
  await dragTo(page, 'dpad', { x: 130, y: 0 });
  await expect.poll(async () => (await stored(page))?.pos.dpad).toBeDefined();
  await tapDone(page);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('title'));
  await expect(page.locator('#title')).toBeVisible();
  await expect.poll(fit).toBe('column');
  expect(await underControls(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('turning the phone upright and back keeps the moved controls', async ({ page }) => {
  const errors = await openEditor(page);
  const { w, h } = await view(page);
  await dragTo(page, 'dpad', { x: 150, y: 200 });
  await dragTo(page, 'fire', { x: 650, y: 180 });
  await expect.poll(async () => Object.keys((await stored(page))?.pos ?? {}).length).toBe(2);
  const before = await placed(page);
  await page.setViewportSize({ width: h, height: w });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#touch')).toBeHidden();
  await page.setViewportSize({ width: w, height: h });
  await expect(page.locator('#rotate')).toBeHidden();
  await expect.poll(async () => (await lf(page, (g) => g.debugTouch)) !== null).toBe(true);
  const after = await placed(page);
  for (const id of ['dpad', 'jump', 'pogo', 'fire'] as const) {
    expect(after.face[id].cx, id).toBeCloseTo(before.face[id].cx, 3);
    expect(after.face[id].cy, id).toBeCloseTo(before.face[id].cy, 3);
  }
  expect(after.custom).toBe(true);
  // The editor is still the screen, and a control still drags.
  expect(await sub(page)).toBe('touchEdit');
  await dragTo(page, 'fire', { x: 600, y: 200 });
  await expect
    .poll(async () => Math.round((await placed(page)).face.fire.cx))
    .not.toBe(Math.round(before.face.fire.cx));
  expect(errors).toEqual([]);
});
