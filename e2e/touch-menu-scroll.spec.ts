// Browser checks that a menu too tall for a phone scrolls inside its area, a whole row at a time, instead of shrinking its rows, and that the Row spacing setting sets the row height.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { ROW_DP, ROW_MIN } from './density';
import { pressUntil, settle } from './keys';

interface Lf {
  debugShow(s: string): void;
}

const SIZES: [string, number, number][] = [
  ['844×390', 844, 390],
  ['740×360', 740, 360],
  ['640×320', 640, 320],
];

/** Options with all nine rows (Sound, Haptics, Display, Captions, Controls, Text size, Motion, Touch controls, Back). */
async function openOptions(page: Page, layout: string): Promise<void> {
  await page.goto(`/?debug&touch&haptics${layout}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    lf.debugShow('options');
  });
  await expect(page.locator('#overlay .menu button')).toHaveCount(9);
  await settle(page);
}

interface View {
  rows: number[];
  scrolls: boolean;
  top: number;
  max: number;
  sel: string;
  selVisible: boolean;
  /** Rows shown part way at the top or bottom edge of the menu (none when the window is on whole rows). */
  cut: string[];
  view: number;
  up: boolean;
  down: boolean;
}

const view = (page: Page): Promise<View> =>
  page.evaluate(() => {
    const m = document.querySelector<HTMLElement>('#overlay .menu')!;
    const sel = m.querySelector<HTMLElement>('button.sel');
    const mr = m.getBoundingClientRect();
    const sr = sel?.getBoundingClientRect();
    const shown = (e: Element | null): boolean =>
      !!e && getComputedStyle(e).display !== 'none' && !(e as HTMLElement).hidden;
    return {
      rows: [...m.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height),
      scrolls: 'scroll' in m.dataset,
      top: m.scrollTop,
      max: m.scrollHeight - m.clientHeight,
      sel: sel?.querySelector('.lbl')?.textContent ?? '',
      selVisible: !!sr && sr.top >= mr.top - 0.5 && sr.bottom <= mr.bottom + 0.5,
      cut: [...m.querySelectorAll('button')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const inside = Math.min(r.bottom, mr.bottom) - Math.max(r.top, mr.top);
          return inside > 0.5 && inside < r.height - 0.5;
        })
        .map((b) => b.querySelector('.lbl')?.textContent ?? ''),
      view: mr.height,
      up: shown(document.querySelector('#overlay .more.up')),
      down: shown(document.querySelector('#overlay .more.down')),
    };
  });

/** For `pressUntil`: the selected row's label is `label` (runs in the page, so it takes it as the argument). */
const selIs = (label: string): boolean =>
  document.querySelector('#overlay .menu button.sel .lbl')?.textContent === label;

async function expectClean(page: Page): Promise<void> {
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui', '#touch'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems, JSON.stringify(problems, null, 2)).toMatchObject({
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
    shortRows: [],
    selectedHidden: [],
    menuCrowds: [],
  });
}

for (const [label, width, height] of SIZES) {
  for (const [layoutName, layout] of [
    ['one column', ''],
    ['split', '&title=split'],
  ] as const) {
    test(`Options at ${label} (${layoutName}): full-height rows scroll, with cues, and the selected row stays in view`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'touch-844',
        'sizes are set here, so one project is enough',
      );
      await page.setViewportSize({ width, height });
      await openOptions(page, layout);

      // Rows keep the full height (Cozy, 40 dp) and the list scrolls a whole row at a time; the head, Back
      // and controls are clear of it.
      let v = await view(page);
      expect(v.scrolls).toBe(true);
      expect(Math.min(...v.rows)).toBeGreaterThanOrEqual(ROW_MIN);
      expect(v.cut).toEqual([]);
      expect(v.view % ROW_DP[1]).toBe(0);
      expect(v.top).toBe(0);
      expect(v.max).toBeGreaterThan(0);
      expect({ up: v.up, down: v.down }).toEqual({ up: false, down: true });
      await expectClean(page);

      // Wrapping up from the first row lands on Back, scrolled into view, with the cue flipped.
      await pressUntil(page, 'ArrowUp', selIs, 'Back');
      await expect.poll(async () => (await view(page)).top).toBe(v.max);
      v = await view(page);
      expect(v.selVisible).toBe(true);
      expect(v.cut).toEqual([]);
      expect(v.top % ROW_DP[1]).toBe(0);
      expect({ up: v.up, down: v.down }).toEqual({ up: true, down: false });
      await expectClean(page);

      // Moving down once more wraps to the top.
      await pressUntil(page, 'ArrowDown', selIs, 'Sound');
      await expect.poll(async () => (await view(page)).top).toBe(0);
      expect((await view(page)).selVisible).toBe(true);

      // Every row on the way down is in view when it is selected.
      for (let i = 1; i < 9; i++) {
        const before = (await view(page)).sel;
        await pressUntil(
          page,
          'ArrowDown',
          (was) => document.querySelector('#overlay .menu button.sel .lbl')?.textContent !== was,
          before,
        );
        await expect.poll(async () => (await view(page)).selVisible).toBe(true);
        // The window is on whole rows after every step: none is cut at either edge.
        const w = await view(page);
        expect(w.cut, `after selecting ${w.sel}`).toEqual([]);
        expect(w.top % ROW_DP[1]).toBe(0);
      }
    });
  }
}

test('a drag scrolls the Options list and a tap on a scrolled row activates the row under the finger', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-844', 'one project is enough');
  await openOptions(page, '&title=split');
  const menu = (await page.locator('#overlay .menu').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  // A finger dragged up the list (from over a stepper, which a tap there would change).
  const x = menu.x + menu.width / 2;
  const y = menu.y + menu.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - i * 20 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await view(page)).top).toBeGreaterThan(0);
  // Where the drag comes to rest, a whole row is at the top and none is cut at either edge.
  await expect
    .poll(async () => {
      const v = await view(page);
      return v.cut.length === 0 && v.top % ROW_DP[1] === 0;
    })
    .toBe(true);
  // The drag chose nothing and opened nothing.
  expect(await page.locator('#overlay h2').textContent()).toBe('Options');
  expect((await view(page)).sel).toBe('Sound');
  await expect.poll(async () => (await view(page)).down).toBe(false);
  const row = page.locator('#overlay .menu button', { hasText: 'Touch controls' });
  const b = (await row.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('#overlay h2')).toHaveText('Touch controls');
});

/** Opens Options on a phone with this density saved (0 Compact, 1 Cozy, 2 Comfy). */
async function openWithDensity(page: Page, density: number, layout = ''): Promise<void> {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k!, v!),
    ['lf-ep1-options-v1', JSON.stringify({ v: 1, density })],
  );
  await openOptions(page, layout);
}

for (const [density, name] of [
  [0, 'Compact'],
  [1, 'Cozy'],
  [2, 'Comfy'],
] as const) {
  test(`${name} rows are ${ROW_DP[density]} dp, scroll on whole rows and keep the selected row in view`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-844', 'one project is enough');
    await page.setViewportSize({ width: 740, height: 360 });
    await openWithDensity(page, density);
    const row = ROW_DP[density];
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--lf-menu-row'),
      ),
    ).toBe(`${row}px`);
    let v = await view(page);
    expect(v.rows.every((h) => Math.abs(h - row) < 0.5)).toBe(true);
    expect(v.scrolls).toBe(true);
    expect(v.cut).toEqual([]);
    expect(v.view % row).toBe(0);
    await expectClean(page);
    // From the first row, Up wraps to Back at the end of the list: still on whole rows.
    await pressUntil(page, 'ArrowUp', selIs, 'Back');
    await expect.poll(async () => (await view(page)).top).toBe((await view(page)).max);
    v = await view(page);
    expect(v.selVisible).toBe(true);
    expect(v.cut).toEqual([]);
    expect(v.top % row).toBe(0);
    await expectClean(page);
  });
}

test('Row spacing on Display resizes the open screen, is saved, and holds after a reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-844', 'one project is enough');
  await openOptions(page, '');
  await pressUntil(page, 'ArrowDown', selIs, 'Haptics');
  await pressUntil(page, 'ArrowDown', selIs, 'Display');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Display',
  );
  const heights = (): Promise<number[]> => view(page).then((v) => v.rows);
  const stored = (): Promise<unknown> =>
    page.evaluate(() => JSON.parse(localStorage.getItem('lf-ep1-options-v1') ?? '{}').density);
  expect(await page.locator('#overlay .menu button .lbl').allInnerTexts()).toEqual([
    'Fullscreen',
    'Keep screen on',
    'Row spacing',
    'Back',
  ]);
  const rowSpacing = page.locator('#overlay .menu button', { hasText: 'Row spacing' });
  await expect(rowSpacing.locator('.val')).toHaveText('Cozy');
  expect((await heights()).every((h) => Math.abs(h - 40) < 0.5)).toBe(true);
  await pressUntil(page, 'ArrowDown', selIs, 'Keep screen on');
  await pressUntil(page, 'ArrowDown', selIs, 'Row spacing');
  // Right goes Cozy to Comfy, which resizes the rows at once, then wraps round to Compact.
  const valIs = (v: string): boolean =>
    document
      .querySelector('#overlay .menu button.sel .val')
      ?.textContent?.replace(/[◄►]/g, '')
      .trim() === v;
  await pressUntil(page, 'ArrowRight', valIs, 'Comfy');
  await expect.poll(async () => (await heights()).every((h) => Math.abs(h - 48) < 0.5)).toBe(true);
  expect(await stored()).toBe(2);
  await pressUntil(page, 'ArrowRight', valIs, 'Compact');
  await expect.poll(async () => (await heights()).every((h) => Math.abs(h - 36) < 0.5)).toBe(true);
  expect(await stored()).toBe(0);
  await expectClean(page);
  // The choice holds after a reload (the page seeds nothing the second time).
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    lf.debugShow('options');
  });
  await expect(page.locator('#overlay .menu button')).toHaveCount(9);
  await settle(page);
  expect((await heights()).every((h) => Math.abs(h - 36) < 0.5)).toBe(true);
  expect(await stored()).toBe(0);
});
