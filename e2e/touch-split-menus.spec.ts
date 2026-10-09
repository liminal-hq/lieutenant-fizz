// Browser checks that the split layout (`?title=split`) puts every other menu's text on the Jump side.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';

// Times out under software GL on the shared CI runner. Disabled for now and kept, to be profiled and
// re-enabled; set LF_E2E_SPLIT_MENUS=1 to run it locally.
test.fixme(
  !process.env['LF_E2E_SPLIT_MENUS'],
  'flaky on CI: times out under software GL on the shared runner; profile and re-enable (LF_E2E_SPLIT_MENUS=1 runs it locally)',
);

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Lf {
  debugShow(s: string): void;
  debugTitle(mode: 'split' | 'column'): void;
}

const KEY = 'lf-touch-v1';

/** Two saved slots, so the slot screen has content and Continue is enabled. */
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

const settings = (hand: 'right' | 'left', pos: Record<string, unknown> = {}): string =>
  JSON.stringify({
    v: 1,
    size: 'M',
    opacity: 100,
    leftHanded: hand === 'left',
    haptics: false,
    pos,
  });

type Screen = 'pause' | 'options' | 'sound' | 'touch' | 'saves' | 'card' | 'controls';

/**
 * The shortest row each screen gets by window height, measured in the split layout and in the one
 * column (what a phone of that height can give), minus nothing: the layout is exact at these sizes.
 */
const ROWS: Record<
  Screen | 'title',
  { split: Record<number, number>; column: Record<number, number> }
> = {
  title: { split: { 390: 48, 360: 48, 320: 48 }, column: { 390: 38, 360: 35, 320: 30 } },
  pause: { split: { 390: 48, 360: 47, 320: 35 }, column: { 390: 41, 360: 36, 320: 29 } },
  options: { split: { 390: 45, 360: 40, 320: 35 }, column: { 390: 35, 360: 31, 320: 25 } },
  sound: { split: { 390: 48, 360: 47, 320: 41 }, column: { 390: 41, 360: 36, 320: 29 } },
  touch: { split: { 390: 45, 360: 40, 320: 35 }, column: { 390: 35, 360: 31, 320: 25 } },
  saves: { split: { 390: 48, 360: 47, 320: 40 }, column: { 390: 41, 360: 36, 320: 29 } },
  card: { split: { 390: 48, 360: 48, 320: 48 }, column: { 390: 48, 360: 48, 320: 32 } },
  controls: { split: {}, column: {} },
};
const MENUS: Screen[] = ['pause', 'options', 'sound', 'touch', 'saves', 'card'];

/** Opens the game with the controls pinned on and the touch settings stored, then waits for it. */
async function boot(
  page: Page,
  o: {
    query?: string;
    hand?: 'right' | 'left';
    pos?: Record<string, unknown>;
    large?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ([save, key, stored, large]) => {
      localStorage.setItem('lf-ep1-slot-1', save!);
      localStorage.setItem(key!, stored!);
      if (large) localStorage.setItem('lf-ep1-options-v1', large);
    },
    [
      JSON.stringify(SAVE),
      KEY,
      settings(o.hand ?? 'right', o.pos),
      o.large ? JSON.stringify({ v: 1, text: 1 }) : '',
    ],
  );
  await page.goto(`/?debug&touch${o.query ?? '&title=split'}`);
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await expect(page.locator('#touch')).toBeVisible();
}

/** Shows a screen from a clean title, as a player gets there (the pause and card screens are over a level). */
async function show(page: Page, screen: Screen | 'title'): Promise<void> {
  await page.evaluate((s) => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    if (s !== 'title') lf.debugShow(s as Screen);
  }, screen);
  const shown = { title: '#title > .menu', controls: '#controls table' }[screen as string];
  await expect(page.locator(shown ?? '#overlay .menu button').first()).toBeVisible();
}

interface Read {
  stage: { title?: string; menuFit?: string; hand?: string };
  head: Box | null;
  /** The thumb-side column (the overlay's body, the title's menu or the Controls table). */
  body: Box;
  menu: Box | null;
  rows: number[];
  dpad: Box;
  back: Box | null;
  touchLeft: number;
  touchRight: number;
  width: number;
  /** The text and rows that sit under a shown control. */
  under: string[];
}

const read = (page: Page, screen: Screen | 'title'): Promise<Read> =>
  page.evaluate((screen) => {
    const box = (e: Element | null): Box | null => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const live = (e: Element | null): e is Element => !!e && e.getBoundingClientRect().width > 0;
    const stage = document.getElementById('stage')!;
    const css = getComputedStyle(document.documentElement);
    const inTitle = screen === 'title' || screen === 'controls';
    const root = document.querySelector(inTitle ? '#title' : '#overlay')!;
    const head = root.querySelector(screen === 'title' ? '.head' : 'h2');
    const menu = root.querySelector('.menu');
    // The overlay's `.body` has no box of its own in the one column, where the menu stands for it.
    const wrap = root.querySelector('.body');
    const body =
      {
        title: menu,
        controls: root.querySelector('#controls'),
      }[screen as string] ?? (live(wrap) ? wrap : menu);
    const faces = [...document.querySelectorAll<HTMLElement>('#touch [data-control]')]
      .filter((e) => !e.hidden)
      .map((e) => e.querySelector('.face')?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0);
    const back = document.getElementById('backBtn')!;
    const under: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(
      '#title :is(h1, p, button, table, .keys span), #overlay :is(h2, p, button, .keys span), #backBtn',
    )) {
      const r = e.getBoundingClientRect();
      if (!r.width || getComputedStyle(e).visibility === 'hidden') continue;
      for (const f of faces) {
        const hit =
          Math.min(r.right, f.right) > Math.max(r.left, f.left) + 1 &&
          Math.min(r.bottom, f.bottom) > Math.max(r.top, f.top) + 1;
        if (hit) under.push(`${e.tagName} “${(e.textContent ?? '').trim().slice(0, 20)}”`);
      }
    }
    return {
      stage: {
        title: stage.dataset.title,
        menuFit: stage.dataset.menuFit,
        hand: stage.dataset.hand,
      },
      head: box(head),
      body: box(body)!,
      menu: box(menu),
      rows: menu
        ? [...menu.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height)
        : [],
      dpad: box(document.querySelector('#touch [data-control="dpad"] .face'))!,
      back: live(back) ? box(back) : null,
      touchLeft: Number.parseFloat(css.getPropertyValue('--lf-touch-left')),
      touchRight: Number.parseFloat(css.getPropertyValue('--lf-touch-right')),
      width: window.innerWidth,
      under,
    } as Read;
  }, screen);

const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;

/** The layout audit over the menu and the controls: nothing clipped, outside the window or mis-sized. */
async function expectClean(page: Page, screen: string): Promise<void> {
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems, `${screen}: ${JSON.stringify(problems, null, 2)}`).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
  });
}

/** The room the split layout needs, checked for one screen with the D-pad on `hand`'s opposite side. */
function expectSplit(
  r: Read,
  screen: Screen | 'title',
  hand: 'right' | 'left',
  height: number,
): void {
  expect(r.stage).toMatchObject({ title: 'split', hand });
  expect(r.stage.menuFit, 'split, not the column').toBeUndefined();
  expect(r.under).toEqual([]);
  const rows = ROWS[screen].split[height];
  if (rows) expect(Math.min(...r.rows)).toBeGreaterThanOrEqual(rows - 0.5);
  if (r.back) {
    if (r.head) expect(overlaps(r.back, r.head), 'the heading is clear of Back').toBe(false);
    expect(overlaps(r.back, r.body), 'the rows are clear of Back').toBe(false);
  }
  if (hand === 'right') {
    // The D-pad is on the left: the heading above it, the rows on the right up to the gutter.
    if (r.head) {
      expect(r.head.bottom).toBeLessThanOrEqual(r.dpad.top + 0.5);
      expect(r.head.left).toBeLessThan(r.dpad.right);
      expect(r.head.right).toBeLessThanOrEqual(r.body.left - 24 + 0.5);
    }
    expect(r.body.right).toBeLessThanOrEqual(r.width - r.touchRight + 0.5);
    expect(r.body.left).toBeGreaterThan(r.dpad.right - 1);
  } else {
    if (r.head) {
      expect(r.head.bottom).toBeLessThanOrEqual(r.dpad.top + 0.5);
      expect(r.head.right).toBeGreaterThan(r.dpad.left);
      expect(r.head.left).toBeGreaterThanOrEqual(r.body.right + 24 - 0.5);
    }
    expect(r.body.left).toBeGreaterThanOrEqual(r.touchLeft - 0.5);
    expect(r.body.right).toBeLessThan(r.dpad.left + 1);
  }
}

const SIZES: [string, { width: number; height: number } | null][] = [
  ['the project window', null],
  ['640×320', { width: 640, height: 320 }],
];

for (const hand of ['right', 'left'] as const) {
  for (const [label, size] of SIZES) {
    test(`split menus at ${label}, ${hand === 'left' ? 'Left-handed' : 'right-handed'}: text on the Jump side, nothing under the controls`, async ({
      page,
    }) => {
      if (size) await page.setViewportSize(size);
      await boot(page, { hand });
      const height = page.viewportSize()!.height;
      for (const screen of ['title', ...MENUS] as const) {
        await show(page, screen);
        await expect
          .poll(async () => (await read(page, screen)).stage.menuFit, { message: screen })
          .toBeUndefined();
        const r = await read(page, screen);
        expectSplit(r, screen, hand, height);
        await expectClean(page, screen);
      }
      // The Controls table keeps the room between the controls, on the Jump side.
      await show(page, 'controls');
      const c = await read(page, 'controls');
      expect(c.under).toEqual([]);
      if (hand === 'right') {
        expect(c.width - c.touchRight - c.body.right).toBeLessThan(1);
        expect(c.body.left).toBeGreaterThanOrEqual(c.touchLeft - 0.5);
      } else {
        expect(c.body.left - c.touchLeft).toBeLessThan(1);
        expect(c.body.right).toBeLessThanOrEqual(c.width - c.touchRight + 0.5);
      }
      await expectClean(page, 'controls');
    });
  }
}

test('a raised D-pad: each menu is split while its heading fits above it, else one column', async ({
  page,
}) => {
  const height = page.viewportSize()!.height;
  // The D-pad's top is 80 px down: the pause heading fits above it, Options (below Back) does not.
  await boot(page, { pos: { dpad: { side: 24, bottom: height - 230 } } });
  const modes: Record<string, string> = {};
  for (const screen of MENUS) {
    await show(page, screen);
    const r = await read(page, screen);
    expect(r.under, screen).toEqual([]);
    if (r.stage.menuFit === 'column') {
      // The fallback is the one-column layout: the text starts right of the D-pad.
      expect(r.head!.left, screen).toBeGreaterThanOrEqual(r.touchLeft - 0.5);
      expect(Math.min(...r.rows), screen).toBeGreaterThanOrEqual(ROWS[screen].column[height]! - 3);
    } else {
      expect(r.head!.bottom, screen).toBeLessThanOrEqual(r.dpad.top + 0.5);
    }
    modes[screen] = r.stage.menuFit ?? 'split';
    await expectClean(page, screen);
  }
  // Options sits under the Back button, which pushes its heading down past the raised D-pad.
  expect(modes.options).toBe('column');
  expect(modes.sound).toBe('column');
  expect(modes.pause).toBe('split');
});

test('a raised, Left-handed D-pad mirrors the fallback', async ({ page }) => {
  await boot(page, {
    hand: 'left',
    pos: { dpad: { side: 24, bottom: page.viewportSize()!.height - 230 } },
  });
  for (const screen of ['pause', 'options'] as const) {
    await show(page, screen);
    const r = await read(page, screen);
    expect(r.under, screen).toEqual([]);
    if (r.stage.menuFit === 'column') {
      // One column on a Left-handed phone ends before the D-pad on the right.
      expect(r.body.right, screen).toBeLessThanOrEqual(r.dpad.left + 1);
    } else {
      expect(r.head!.bottom, screen).toBeLessThanOrEqual(r.dpad.top + 0.5);
      expect(r.head!.right, screen).toBeGreaterThan(r.dpad.left);
    }
    await expectClean(page, screen);
  }
});

test('without the flag the other menus keep the one column', async ({ page }) => {
  await boot(page, { query: '' });
  const height = page.viewportSize()!.height;
  for (const screen of MENUS) {
    await show(page, screen);
    const r = await read(page, screen);
    expect(r.stage.title, screen).toBeUndefined();
    expect(r.under, screen).toEqual([]);
    // The heading and the rows share one column, right of the D-pad.
    expect(r.head!.left, screen).toBeGreaterThanOrEqual(r.touchLeft - 0.5);
    expect(r.body.left, screen).toBeGreaterThanOrEqual(r.touchLeft - 0.5);
    expect(Math.abs(r.head!.left - r.body.left), screen).toBeLessThan(40);
    expect(Math.min(...r.rows), screen).toBeGreaterThanOrEqual(ROWS[screen].column[height]! - 0.5);
    await expectClean(page, screen);
  }
});

test('debugTitle moves an open menu between the split and the column', async ({ page }) => {
  await boot(page, { query: '' });
  await show(page, 'options');
  const before = await read(page, 'options');
  expect(before.head!.left).toBeGreaterThanOrEqual(before.touchLeft - 0.5);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugTitle('split'));
  await expect
    .poll(async () => (await read(page, 'options')).head!.left)
    .toBeLessThan(before.touchLeft);
  expectSplit(await read(page, 'options'), 'options', 'right', page.viewportSize()!.height);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugTitle('column'));
  await expect
    .poll(async () => (await read(page, 'options')).head!.left)
    .toBeGreaterThanOrEqual(before.touchLeft - 0.5);
});

test('the Back button still closes a split screen with a tap', async ({ page }) => {
  await boot(page);
  await show(page, 'options');
  const back = (await read(page, 'options')).back!;
  await page.touchscreen.tap((back.left + back.right) / 2, (back.top + back.bottom) / 2);
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#title > .menu')).toBeVisible();
});

test('Large text: each menu is split where it fits and one column where it does not', async ({
  page,
}) => {
  await boot(page, { large: true });
  for (const screen of MENUS) {
    await show(page, screen);
    const r = await read(page, screen);
    expect(r.under, screen).toEqual([]);
    if (r.stage.menuFit !== 'column') {
      expect(r.head!.bottom, screen).toBeLessThanOrEqual(r.dpad.top + 0.5);
      expect(r.head!.right, screen).toBeLessThanOrEqual(r.body.left - 24 + 0.5);
    }
    await expectClean(page, screen);
  }
});
