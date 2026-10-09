// Browser checks that a menu too tall for a phone scrolls inside its area, a whole row at a time, instead of shrinking its rows, and that the Row spacing setting sets the row height.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type CDPSession, type Page } from '@playwright/test';
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

/** Reads the scrolling menu of `root` (the overlay by default, or `#title` for the title menu). */
const view = (page: Page, root = '#overlay'): Promise<View> =>
  page.evaluate((root) => {
    const m = document.querySelector<HTMLElement>(`${root} .menu`)!;
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
      sel: (sel?.querySelector('.lbl') ?? sel?.querySelector('.l1'))?.textContent ?? '',
      selVisible: !!sr && sr.top >= mr.top - 0.5 && sr.bottom <= mr.bottom + 0.5,
      cut: [...m.querySelectorAll('button')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const inside = Math.min(r.bottom, mr.bottom) - Math.max(r.top, mr.top);
          return inside > 0.5 && inside < r.height - 0.5;
        })
        .map((b) => (b.querySelector('.lbl') ?? b.querySelector('.l1'))?.textContent ?? ''),
      view: mr.height,
      up: shown(document.querySelector(`${root} .more.up`)),
      down: shown(document.querySelector(`${root} .more.down`)),
    };
  }, root);

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
      // The first key press brings the keyboard's hints, which can wrap the hint bar and shorten the list,
      // so the end of the scroll is read again rather than carried over from the touch hints.
      await expect
        .poll(async () => {
          const now = await view(page);
          return now.top === now.max;
        })
        .toBe(true);
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
  // A finger dragged up the list (from over a stepper, which a tap there would change).
  await drag(page, -240);
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

/** Opens Options, then Display, and returns the helpers the Row spacing checks share. */
async function openDisplay(page: Page): Promise<{
  heights: () => Promise<number[]>;
  stored: () => Promise<unknown>;
}> {
  await openOptions(page, '');
  await pressUntil(page, 'ArrowDown', selIs, 'Haptics');
  await pressUntil(page, 'ArrowDown', selIs, 'Display');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Display',
  );
  return {
    heights: () => view(page).then((v) => v.rows),
    stored: () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('lf-ep1-options-v1') ?? '{}').density),
  };
}

/** For `pressUntil`: the selected row's value is `v` (its arrows aside). */
const valIs = (v: string): boolean =>
  document
    .querySelector('#overlay .menu button.sel .val')
    ?.textContent?.replace(/[◄►]/g, '')
    .trim() === v;

test('Row spacing on Display resizes the open screen at once and is saved', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-844', 'one project is enough');
  const { heights, stored } = await openDisplay(page);
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
  await pressUntil(page, 'ArrowRight', valIs, 'Comfy');
  await expect.poll(async () => (await heights()).every((h) => Math.abs(h - 48) < 0.5)).toBe(true);
  expect(await stored()).toBe(2);
  await pressUntil(page, 'ArrowRight', valIs, 'Compact');
  await expect.poll(async () => (await heights()).every((h) => Math.abs(h - 36) < 0.5)).toBe(true);
  expect(await stored()).toBe(0);
  await expectClean(page);
});

test('Row spacing holds after a reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-844', 'one project is enough');
  const { heights, stored } = await openDisplay(page);
  await pressUntil(page, 'ArrowDown', selIs, 'Keep screen on');
  await pressUntil(page, 'ArrowDown', selIs, 'Row spacing');
  await pressUntil(page, 'ArrowRight', valIs, 'Comfy');
  await expect.poll(stored).toBe(2);
  // The page seeds nothing the second time, so Options opens on what was saved.
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
  expect((await heights()).every((h) => Math.abs(h - 48) < 0.5)).toBe(true);
  expect(await stored()).toBe(2);
});

/** One CDP session per page: a session per drag would pile up for the page's life. */
const touchSessions = new WeakMap<Page, CDPSession>();

/**
 * A finger dragged `dy` px (negative is up) over the middle of the menu of `root`, in a few big moves.
 * Each move is a round trip to a page that is busy drawing under software GL, so a move every 20 px made
 * a 400 px drag take seconds on a shared CI runner; four moves are still enough to start a scroll.
 */
async function drag(page: Page, dy: number, root = '#overlay'): Promise<void> {
  const menu = (await page.locator(`${root} .menu`).first().boundingBox())!;
  let cdp = touchSessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    touchSessions.set(page, cdp);
  }
  const x = menu.x + menu.width / 2;
  const y = menu.y + menu.height / 2;
  const steps = Math.ceil(Math.abs(dy) / 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (dy * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** For `pressUntil`: the selection on the screen of `root` is no longer the row whose text follows the bar. */
const selMoved = (arg: string): boolean => {
  const [root, was] = arg.split('|') as [string, string];
  const sel = document.querySelector(`${root} .menu button.sel`);
  return (sel?.querySelector('.lbl') ?? sel?.querySelector('.l1'))?.textContent !== was;
};

/** Saves that fill every slot with a long place name (Marshmallow Meadows), the Large text size and the density, set before the page loads. */
async function bootSaves(page: Page, layout: string, density = 1): Promise<void> {
  const save = JSON.stringify({
    v: 3,
    at: Date.UTC(2026, 9, 7, 16),
    progress: {
      lives: 3,
      score: 12340,
      nextLife: 12400,
      ammo: 5,
      doneMask: 0b10111,
      played: 5400,
      map: { x: 0, y: 24 },
    },
  });
  await page.addInitScript(
    ([opts, s]) => {
      localStorage.setItem('lf-ep1-options-v1', opts!);
      localStorage.setItem('lf-ep1-save-v1', s!);
      for (const k of ['1', '2', '3', '4']) localStorage.setItem(`lf-ep1-slot-${k}`, s!);
    },
    [JSON.stringify({ v: 1, density, text: 1 }), save],
  );
  await page.goto(`/?debug&touch&haptics${layout}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    lf.debugShow('saves');
  });
  await expect(page.locator('#overlay .menu button')).toHaveCount(6);
  await settle(page);
}

/** Every row of a scrolling list is the same height and the window is on whole rows, with no sliver at either edge. */
function expectWhole(v: View, what: string, min = ROW_MIN): void {
  if (!v.scrolls) return;
  const unit = v.rows[0]!;
  expect(
    v.rows.every((h) => Math.abs(h - unit) < 0.5),
    `${what}: rows ${v.rows.join(',')}`,
  ).toBe(true);
  expect(unit, what).toBeGreaterThanOrEqual(min);
  expect(v.cut, what).toEqual([]);
  expect(v.top % unit, what).toBeLessThan(0.5);
  expect(v.view % unit, what).toBeLessThan(0.5);
}

for (const [label, width, height] of SIZES) {
  for (const [layoutName, layout] of [
    ['one column', ''],
    ['split', '&title=split'],
  ] as const) {
    for (const [density, densityName] of [
      [1, 'Cozy'],
      [0, 'Compact'],
    ] as const) {
      test(`Saves with long, wrapping slots at ${label} (${layoutName}, ${densityName}): one row unit, no sliver after keys and at the bottom`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'touch-844', 'sizes are set here');
        await page.setViewportSize({ width, height });
        await bootSaves(page, layout, density);
        let v = await view(page);
        // Where a slot's text wraps, every row (the one-line Back too) takes the tallest row's height.
        if (width === 640) expect(Math.max(...v.rows)).toBeGreaterThan(ROW_DP[density] + 0.5);
        expectWhole(v, 'first open', ROW_DP[density] - 0.1);
        await expectClean(page);

        // Down through every row, and the selected one is whole in view with no sliver beside it.
        for (let i = 0; i < 8 && v.sel !== 'Back'; i++) {
          const was = v.sel;
          await pressUntil(page, 'ArrowDown', selMoved, `#overlay|${was}`);
          await expect.poll(async () => (await view(page)).selVisible).toBe(true);
          v = await view(page);
          expectWhole(v, `after Down to ${v.sel}`, ROW_DP[density] - 0.1);
          await expectClean(page);
        }
        expect(v.sel).toBe('Back');
        // At the bottom, nothing is hidden below.
        if (v.scrolls) expect({ up: v.up, down: v.down }).toEqual({ up: true, down: false });
      });
    }
  }
}

// A drag is a round trip to the page for each move, which is slow while the page draws under software
// GL, so the drags are their own tests and run for one density (the snapping does not depend on it).
for (const [label, width, height] of SIZES) {
  test(`Saves with long, wrapping slots at ${label} (one column, Cozy): a drag up and down comes to rest on a whole row`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-844', 'sizes are set here');
    await page.setViewportSize({ width, height });
    await bootSaves(page, '', 1);
    const min = ROW_DP[1] - 0.1;
    // A drag down comes to rest at the top on a whole row ...
    await drag(page, 400);
    await expect.poll(async () => (await view(page)).top).toBe(0);
    expectWhole(await view(page), 'after a drag to the top', min);
    // ... and a drag up ends at the bottom the same way.
    await drag(page, -400);
    await expect.poll(async () => (await view(page)).top).toBe((await view(page)).max);
    await expect
      .poll(async () => {
        const w = await view(page);
        return w.cut.length === 0 && w.top % w.rows[0]! < 0.5;
      })
      .toBe(true);
    await expectClean(page);
  });
}

/** The title menu with a saved game, so Continue and Load game show: five rows. */
async function bootTitle(page: Page, layout: string, density = 1): Promise<void> {
  await page.addInitScript(
    ([opts, s]) => {
      localStorage.setItem('lf-ep1-options-v1', opts!);
      localStorage.setItem('lf-ep1-save-v1', s!);
    },
    [
      JSON.stringify({ v: 1, density }),
      JSON.stringify({
        v: 3,
        at: Date.UTC(2026, 9, 7, 16),
        progress: {
          lives: 3,
          score: 12340,
          nextLife: 12400,
          ammo: 5,
          doneMask: 0b10111,
          played: 5400,
          map: { x: 0, y: 24 },
        },
      }),
    ],
  );
  await page.goto(`/?debug&touch&haptics${layout}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('title'));
  await expect(page.locator('#title > .menu button')).toHaveCount(5);
  await settle(page);
}

for (const [label, width, height] of SIZES) {
  for (const density of [1, 2, 0] as const) {
    test(`title menu at ${label} (one column, ${['Compact', 'Cozy', 'Comfy'][density]}): the chevrons never touch a cursor, the wordmark or the hint line`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'touch-844', 'sizes are set here');
      await page.setViewportSize({ width, height });
      await bootTitle(page, '', density);
      let v = await view(page, '#title');
      test.skip(!v.scrolls, 'this size shows the whole title menu');
      expectWhole(v, 'first open', ROW_DP[density] - 0.1);
      // The strips stay below the wordmark and above the hint line.
      const clear = async (): Promise<void> => {
        const g = await page.evaluate(() => {
          const m = document.querySelector<HTMLElement>('#title > .menu')!;
          const r = m.getBoundingClientRect();
          const strip = Number(m.dataset.strip ?? 0);
          return {
            top: r.top - strip,
            bottom: r.bottom + strip,
            head: document.querySelector('#title .head')!.getBoundingClientRect().bottom,
            keys: document.querySelector('#title .keys')!.getBoundingClientRect().top,
          };
        });
        expect(g.top).toBeGreaterThanOrEqual(g.head - 0.5);
        expect(g.bottom).toBeLessThanOrEqual(g.keys + 0.5);
        await expectClean(page);
      };
      await clear();
      // Down through every row and back up: with the first, the last and each middle row selected, and
      // rows hidden above or below, the chevron stays clear of every row and its cursor.
      const seen = new Set<string>();
      for (let i = 0; i < 5; i++) {
        v = await view(page, '#title');
        seen.add(`${v.up ? 'up' : ''}${v.down ? 'down' : ''}`);
        await clear();
        await pressUntil(page, 'ArrowDown', selMoved, `#title|${v.sel}`);
        await expect.poll(async () => (await view(page, '#title')).selVisible).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        v = await view(page, '#title');
        seen.add(`${v.up ? 'up' : ''}${v.down ? 'down' : ''}`);
        await clear();
        await pressUntil(page, 'ArrowUp', selMoved, `#title|${v.sel}`);
        await expect.poll(async () => (await view(page, '#title')).selVisible).toBe(true);
      }
      // Both ends were seen with rows hidden past them (the last visible row selected with rows below,
      // and the first with rows above).
      expect([...seen]).toEqual(expect.arrayContaining(['down', 'up']));
    });
  }
}
