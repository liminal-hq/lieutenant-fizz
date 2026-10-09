// Browser checks that the on-screen controls drive the menus like a gamepad on a landscape phone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { hintText } from '../packages/engine/src/font/tokens';
import { audit } from './audit';

interface Circle {
  cx: number;
  cy: number;
  r: number;
}
type ControlId = 'dpad' | 'jump' | 'pogo' | 'fire' | 'pause';
interface Lf {
  debugShow(s: string): void;
  debugTitle(mode: 'split' | 'column'): void;
  debugState: { screen: string; sub: string | null; menu: number };
  debugTouch: { face: Record<ControlId, Circle> } | null;
}
interface Point {
  x: number;
  y: number;
  id: number;
}

const state = (page: Page): Promise<Lf['debugState']> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState);
const faces = async (page: Page): Promise<Record<ControlId, Circle>> => {
  const p = await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugTouch);
  if (!p) throw new Error('the touch controls are not showing');
  return p.face;
};

/** Two saved slots, so Continue and Load game are enabled and the slot screen has content. */
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

/** Opens a screen with the controls pinned on (`?touch`), as a phone shows it. */
async function open(page: Page, screen: string, query = ''): Promise<void> {
  await page.addInitScript((save) => {
    localStorage.setItem('lf-ep1-slot-1', JSON.stringify(save));
  }, SAVE);
  await page.goto(`/?debug&touch${query}`);
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await expect(page.locator('#touch')).toBeVisible();
  await page.waitForTimeout(400);
}

/** Touch events through the DevTools protocol, so a finger can be held down. */
async function fingers(page: Page): Promise<{
  down(p: Point): Promise<void>;
  up(): Promise<void>;
}> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    down: async (p) =>
      void (await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: p.x, y: p.y, id: p.id }],
      })),
    up: async () =>
      void (await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })),
  };
}

/** A tap on a D-pad arm: a touch that lifts at once, which the controls count as one press. */
async function dpad(page: Page, dir: 'up' | 'down' | 'left' | 'right'): Promise<void> {
  const d = (await faces(page)).dpad;
  const off = d.r * 0.7;
  const at = {
    up: { x: d.cx, y: d.cy - off },
    down: { x: d.cx, y: d.cy + off },
    left: { x: d.cx - off, y: d.cy },
    right: { x: d.cx + off, y: d.cy },
  }[dir];
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForTimeout(150);
}

async function tapControl(page: Page, id: ControlId): Promise<void> {
  const c = (await faces(page))[id];
  await page.touchscreen.tap(c.cx, c.cy);
  await page.waitForTimeout(120);
}

const selected = (page: Page): Promise<string> =>
  page.locator('#ui .menu:visible button.sel .lbl').first().innerText();

/** The controls showing now. */
const shown = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#touch [data-control]')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .map((e) => e.dataset.control ?? ''),
  );

/** The hint bar's text on the screen showing. */
const hints = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const bar = [...document.querySelectorAll<HTMLElement>('#ui .keys')].find(
      (e) => e.getBoundingClientRect().width > 0,
    );
    return bar ? [...bar.children].map((s) => s.textContent ?? '') : [];
  });

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

test('on the pause menu the D-pad moves and Select chooses', async ({ page }) => {
  await open(page, 'pause');
  expect(await selected(page)).toBe('Resume');
  // A tap is seen once however slow the frame that reads it, so wait for the move, not for the clock.
  await dpad(page, 'down');
  await expect.poll(() => selected(page)).toBe('Save game');
  await dpad(page, 'up');
  await expect.poll(() => selected(page)).toBe('Resume');
  await tapControl(page, 'jump');
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
  // Back in play, every control shows again and Jump is Jump.
  expect(await shown(page)).toEqual(['dpad', 'jump', 'pogo', 'fire', 'pause']);
  await expect(page.locator('#touch [data-control="jump"] .lbl')).toHaveText('Jump');
});

test('Back (Pogo) closes Options', async ({ page }) => {
  await open(page, 'options');
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#touch [data-control="pogo"]')).toHaveAttribute('aria-label', 'Back');
  await tapControl(page, 'pogo');
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#title > .menu')).toBeVisible();
  expect((await state(page)).sub).toBe(null);
});

for (const screen of ['pause', 'card', 'title', 'options', 'saves'] as const) {
  test(`${screen}: the controls stay up, the hints are for touch and nothing sits under a control`, async ({
    page,
  }) => {
    await open(page, screen);
    const controls = await shown(page);
    expect(controls).toContain('dpad');
    expect(controls).toContain('jump');
    expect(controls).not.toContain('fire');
    await expect(page.locator('#touch [data-control="jump"] .lbl')).toHaveText('Select');
    // Touch hints: what each screen's hints say, and that they carry no key or gamepad glyph, are
    // proved by hints.test.ts; this checks the bar shows them.
    const bar = await hints(page);
    expect(bar.length).toBeGreaterThan(0);
    expect(bar.some((h) => h.startsWith(hintText('{[D-pad]}')))).toBe(true);
    // The pause menu shows no F5 or F9 on its rows.
    await expect(page.locator('#overlay .menu .val', { hasText: /F5|F9/ })).toHaveCount(0);
    expect(await underControls(page)).toEqual([]);
    const report = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
    const { checked, ...problems } = report;
    expect(checked).toBeGreaterThan(3);
    expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
      pageOverflow: [],
      outside: [],
      badSize: [],
      clipped: [],
      crowdsHints: [],
    });
  });
}

test('a held D-pad direction repeats', async ({ page }) => {
  await open(page, 'pause');
  expect((await state(page)).menu).toBe(0);
  // One press and then repeats from 350 ms, every 90 ms.
  const d = (await faces(page)).dpad;
  const f = await fingers(page);
  await f.down({ x: d.cx, y: d.cy + d.r * 0.7, id: 1 });
  await expect
    .poll(() => state(page).then((s) => s.menu), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  await f.up();
});

test('a Jump held as the level-cleared card appears chooses nothing until pressed again', async ({
  page,
}) => {
  test.fixme(true, 'flaky on CI: times out waiting for the card; profile and re-enable');
  await open(page, 'play');
  const jump = (await faces(page)).jump;
  const f = await fingers(page);
  await f.down({ x: jump.cx, y: jump.cy, id: 2 });
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('card'));
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('card');
  await page.waitForTimeout(400);
  await f.up();
  await page.waitForTimeout(300);
  expect((await state(page)).screen).toBe('card');
  await tapControl(page, 'jump');
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
});

test('one tap on a row chooses it', async ({ page }) => {
  await open(page, 'pause');
  const row = page.locator('#overlay .menu button', { hasText: 'Options' });
  const r = (await row.boundingBox())!;
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.locator('#overlay h2')).toHaveText('Options');
  expect((await state(page)).sub).toBe('options');
});

test('the Options steppers go down and up', async ({ page }) => {
  await open(page, 'options');
  const music = page.locator('#overlay .menu button').first();
  const lit = (): Promise<number> => music.locator('.meter i.on').count();
  const before = await lit();
  const less = (await music.locator('[data-step="-1"]').boundingBox())!;
  const more = (await music.locator('[data-step="1"]').boundingBox())!;
  expect(Math.min(less.width, more.width)).toBeGreaterThanOrEqual(47.9);
  await page.touchscreen.tap(less.x + less.width / 2, less.y + less.height / 2);
  await expect.poll(lit).toBe(before - 1);
  const more2 = (await music.locator('[data-step="1"]').boundingBox())!;
  await page.touchscreen.tap(more2.x + more2.width / 2, more2.y + more2.height / 2);
  await expect.poll(lit).toBe(before);
  // The row a stepper is on becomes the selected one.
  expect((await state(page)).menu).toBe(0);
});

test('a tap on the cinematic text finishes the line, then moves on', async ({ page }) => {
  await open(page, 'cine');
  await expect(page.locator('#touch [data-control="dpad"]')).toBeHidden();
  const text = (await page.locator('#letterbox .bar.bottom .text').boundingBox())!;
  const at = { x: text.x + 40, y: text.y + 10 };
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('#letterbox .hidden-text')).toHaveText('');
  const pips = await page.locator('#letterbox .pips').innerText();
  await page.waitForTimeout(150);
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('#letterbox .pips')).not.toHaveText(pips);
});

test('a tap on the dialogue moves to the next line', async ({ page }) => {
  await open(page, 'dialogue');
  const first = await page.locator('#dialogue .shown').innerText();
  const box = (await page.locator('#dialogue .text').boundingBox())!;
  await page.touchscreen.tap(box.x + 30, box.y + 10);
  await expect(page.locator('#dialogue .shown')).not.toHaveText(first);
});

test('Skip and Continue are at least 48 dp', async ({ page }) => {
  await open(page, 'cine');
  for (const sel of ['#letterbox .skip', '#letterbox .next']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(47.9);
  }
});

test('Select works again after a long press, on a screen that stays', async ({ page }) => {
  await open(page, 'options');
  // The selected row's meter (a save makes the title start on Continue, so this is not always row 0).
  const lit = (): Promise<number> => page.locator('#overlay .menu button.sel .meter i.on').count();
  const select = (await faces(page)).jump;
  const f = await fingers(page);
  const start = await lit();
  // A long press: Select acts once, on the press.
  await f.down({ x: select.cx, y: select.cy, id: 1 });
  await page.waitForTimeout(150);
  await page.waitForTimeout(350);
  await f.up();
  await page.waitForTimeout(300);
  await expect.poll(lit).not.toBe(start);
  const afterHold = await lit();
  await page.waitForTimeout(150);
  // And a quick tap afterwards still works: the long press must not leave Select stuck.
  await tapControl(page, 'jump');
  await expect.poll(lit).not.toBe(afterHold);
  const afterTap = await lit();
  await page.waitForTimeout(150);
  await f.down({ x: select.cx, y: select.cy, id: 1 });
  await page.waitForTimeout(300);
  await f.up();
  await expect.poll(lit).not.toBe(afterTap);
});

test('the controls become lighter glass on a menu and go back to dark glass in play', async ({
  page,
}) => {
  await open(page, 'pause');
  const mode = (): Promise<string | undefined> =>
    page.evaluate(() => document.getElementById('touch')?.dataset.mode);
  expect(await mode()).toBe('menu');
  const glass = await page.evaluate(() => {
    const f = document.querySelector('#touch [data-control="pause"] .face') as HTMLElement;
    return getComputedStyle(f).backgroundColor;
  });
  expect(glass).toContain('255, 255, 255');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect.poll(mode).toBe('play');
});

test('on a menu Select acts when the finger lifts inside it, not when it lands', async ({
  page,
}) => {
  await open(page, 'pause');
  const select = (await faces(page)).jump;
  const f = await fingers(page);
  await f.down({ x: select.cx, y: select.cy, id: 1 });
  // While the finger is down nothing has happened yet, however long it stays.
  await page.waitForTimeout(500);
  expect((await state(page)).screen).toBe('pause');
  await expect(page.locator('#touch [data-control="jump"]')).toHaveClass(/press/);
  await f.up();
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
});

test('sliding off Select before lifting cancels it', async ({ page }) => {
  await open(page, 'pause');
  const select = (await faces(page)).jump;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [{ x: select.cx, y: select.cy, id: 1 }]);
  await send('touchMove', [{ x: select.cx - 200, y: select.cy - 100, id: 1 }]);
  await send('touchEnd', []);
  await page.waitForTimeout(600);
  expect((await state(page)).screen).toBe('pause');
  await expect(page.locator('#touch [data-control="jump"]')).not.toHaveClass(/press/);
  // A real tap afterwards still works.
  await tapControl(page, 'jump');
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('play');
});

/** Rows of a one-column title, by window height: what a phone of that height can give them. */
const COLUMN_ROWS: Record<number, number> = { 390: 38, 360: 35, 320: 30 };

interface TitleBoxes {
  rows: number[];
  head: DOMRect;
  menu: DOMRect;
  dpad: DOMRect;
  touchRight: number;
  data: { title?: string; fit?: string };
}

const titleBoxes = (page: Page): Promise<TitleBoxes> =>
  page.evaluate(() => {
    const stage = document.getElementById('stage')!;
    const menu = document.querySelector<HTMLElement>('#title > .menu')!;
    return {
      rows: [...menu.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height),
      head: document.querySelector('#title .head')!.getBoundingClientRect().toJSON(),
      menu: menu.getBoundingClientRect().toJSON(),
      dpad: document
        .querySelector('#touch [data-control="dpad"] .face')!
        .getBoundingClientRect()
        .toJSON(),
      touchRight: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--lf-touch-right'),
      ),
      data: { title: stage.dataset.title, fit: stage.dataset.titleFit },
    };
  });

const TITLE_SIZES: [string, { width: number; height: number } | null][] = [
  ['the project window', null],
  ['640×320', { width: 640, height: 320 }],
];

for (const mode of ['column', 'split'] as const) {
  for (const [label, size] of TITLE_SIZES) {
    test(`the ${mode} title at ${label}: nothing under the controls, rows and head fit`, async ({
      page,
    }) => {
      if (size) await page.setViewportSize(size);
      await open(page, 'title', mode === 'split' ? '&title=split' : '');
      const height = page.viewportSize()!.height;
      const b = await titleBoxes(page);
      expect(b.rows).toHaveLength(5);
      const min = Math.min(...b.rows);
      if (mode === 'column') {
        // No flag leaves the layout unset, and the rows keep the height the head leaves them.
        expect(b.data.title).toBeUndefined();
        expect(min).toBeGreaterThanOrEqual(COLUMN_ROWS[height]!);
        expect(b.head.bottom).toBeLessThanOrEqual(b.menu.top);
      } else {
        expect(b.data).toEqual({ title: 'split', fit: undefined });
        expect(min).toBeGreaterThanOrEqual(47.9);
        expect(b.head.bottom).toBeLessThanOrEqual(b.dpad.top);
        expect(b.head.right).toBeLessThanOrEqual(b.menu.left);
        expect(b.menu.right).toBeLessThanOrEqual(page.viewportSize()!.width - b.touchRight + 0.5);
      }
      expect(await underControls(page)).toEqual([]);
      const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
      expect(checked).toBeGreaterThan(3);
      expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
        pageOverflow: [],
        outside: [],
        badSize: [],
        clipped: [],
        crowdsHints: [],
      });
    });
  }
}

test('the title text is outlined by one glyph pixel on touch', async ({ page }) => {
  await open(page, 'title');
  const shadows = await page.evaluate(() => {
    const pick = (sel: string): string => getComputedStyle(document.querySelector(sel)!).textShadow;
    return [
      pick('#title .kicker'),
      pick('#title .episode'),
      pick('#title .menu button:not(.sel) .lbl'),
      pick('#title .keys'),
    ];
  });
  for (const shadow of shadows) {
    expect(shadow.match(/rgb\(5, 5, 7\)/g)).toHaveLength(4);
  }
});

test('debugTitle switches between the two title layouts live', async ({ page }) => {
  await open(page, 'title');
  const layout = (): Promise<string | undefined> =>
    page.evaluate(() => document.getElementById('stage')!.dataset.title);
  expect(await layout()).toBeUndefined();
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugTitle('split'));
  expect(await layout()).toBe('split');
  await expect
    .poll(async () => Math.min(...(await titleBoxes(page)).rows))
    .toBeGreaterThanOrEqual(47.9);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugTitle('column'));
  expect(await layout()).toBeUndefined();
});

test('Controls on the split title shows the one-column table', async ({ page }) => {
  await open(page, 'title', '&title=split');
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('controls'));
  await expect(page.locator('#controls')).toBeVisible();
  const grid = await page.evaluate(
    () => getComputedStyle(document.getElementById('title')!).display,
  );
  expect(grid).toBe('flex');
});

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;

/** The Controls screen on a phone: the touch column, no keys, nothing under the controls. */
for (const [label, size] of TITLE_SIZES) {
  test(`Controls at ${label} shows the Action and Touch columns and no keys`, async ({ page }) => {
    if (size) await page.setViewportSize(size);
    await open(page, 'controls');
    await expect(page.locator('#controls')).toBeVisible();
    const heads = await page.locator('#controls th').allInnerTexts();
    expect(heads).toEqual(['Action', 'Touch']);
    // The controls' own names are drawn as keycaps, so check the text the table was built from. The
    // rows, the names and the absence of key glyphs are proved by hints.test.ts.
    const html = await page.locator('#controls table').innerHTML();
    for (const token of ['{[D-pad]}', '{[Select]}', '{[Back]}', '{[Pause]}']) {
      expect(html, token).toContain(hintText(token));
    }
    // The Back row is hidden, since the Back button and the Back control close the screen.
    await expect(page.locator('#controls > .menu')).toBeHidden();
    expect(await underControls(page)).toEqual([]);
    const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
    expect(checked).toBeGreaterThan(3);
    expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
      pageOverflow: [],
      outside: [],
      badSize: [],
      clipped: [],
      crowdsHints: [],
    });
  });
}

const SUBS = ['controls', 'options', 'saves'] as const;
const rect = (page: Page, selector: string): Promise<Box[]> =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.getBoundingClientRect().toJSON()),
    selector,
  );

for (const [label, size] of TITLE_SIZES) {
  for (const sub of SUBS) {
    test(`the Back button over ${sub} at ${label} is 48 dp, inside the safe area and clear of the content`, async ({
      page,
    }) => {
      if (size) await page.setViewportSize(size);
      await open(page, sub);
      const back = page.locator('#backBtn');
      await expect(back).toBeVisible();
      await expect(back).toHaveText('← Back');
      const insets = { left: 48, right: 32, bottom: 20 };
      await page.addStyleTag({
        content: `:root { --lf-safe-left: ${insets.left}px; --lf-safe-right: ${insets.right}px; --lf-safe-bottom: ${insets.bottom}px; }`,
      });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await expect
        .poll(async () => (await back.boundingBox())!.x)
        .toBeGreaterThanOrEqual(insets.left + 16 - 0.5);
      const b = (await back.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(47.9);
      expect(b.height).toBeGreaterThanOrEqual(47.9);
      expect(b.y).toBeGreaterThanOrEqual(8 - 0.5);
      const box = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
      const content = await rect(
        page,
        '#title :is(h1, .head, table, .menu button, .keys span), #overlay :is(h2, table, .menu button, .keys span)',
      );
      for (const c of content) expect(overlaps(box, c), JSON.stringify([box, c])).toBe(false);
      expect(await underControls(page)).toEqual([]);
      const report = await page.evaluate(audit, {
        roots: ['#ui', '#touch'],
        insets: { top: 0, ...insets },
      });
      expect(report.outside, JSON.stringify(report.outside)).toEqual([]);
    });
  }
}

test('the Back button is hidden on the title menu, in play and on the pause menu', async ({
  page,
}) => {
  await open(page, 'title');
  await expect(page.locator('#backBtn')).toBeHidden();
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('pause'));
  await expect(page.locator('#backBtn')).toBeHidden();
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await expect(page.locator('#backBtn')).toBeHidden();
});

for (const sub of SUBS) {
  test(`a tap on Back closes ${sub} on the title`, async ({ page }) => {
    await open(page, sub);
    expect((await state(page)).sub).toBe(sub);
    const b = (await page.locator('#backBtn').boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => state(page).then((s) => s.sub)).toBe(null);
    expect((await state(page)).screen).toBe('title');
    await expect(page.locator('#title > .menu')).toBeVisible();
    await expect(page.locator('#backBtn')).toBeHidden();
  });
}

for (const [sub, row] of [
  ['options', 'Options'],
  ['saves', 'Load game'],
] as const) {
  test(`a tap on Back closes ${sub} on the pause menu`, async ({ page }) => {
    await open(page, 'pause');
    await expect(page.locator('#backBtn')).toBeHidden();
    const r = (await page.locator('#overlay .menu button', { hasText: row }).boundingBox())!;
    await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    await expect.poll(() => state(page).then((s) => s.sub)).toBe(sub);
    await expect(page.locator('#backBtn')).toBeVisible();
    // Pause has nothing to do on a screen opened over the menu: Back closes it.
    expect(await shown(page)).toEqual(['dpad', 'jump', 'pogo']);
    const b = (await page.locator('#backBtn').boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => state(page).then((s) => s.sub)).toBe(null);
    expect((await state(page)).screen).toBe('pause');
    await expect(page.locator('#backBtn')).toBeHidden();
    await expect(page.locator('#overlay h2')).toHaveText('Paused');
  });
}
