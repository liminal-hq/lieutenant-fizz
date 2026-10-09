// Browser checks of the story letterbox: the phone strip and floating top bar, and the desktop's opaque bars.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Circle {
  cx: number;
  cy: number;
  r: number;
}
interface Lf {
  debugShow(s: string): void;
  primary(): void;
  ui: { showLetterbox(o: unknown): void };
  debugState: { screen: string; story: { scene: number; beat: number; done: boolean } };
  debugTouch: { face: { jump: Circle; pause: Circle } } | null;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  b: number;
}

/** Opens a story screen with the sound muted, as a phone (the touch controls pinned on) or a desktop. */
async function open(page: Page, screen: 'cine' | 'ending', touch: boolean): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, audio: 0, music: 0, sfx: 0 }));
  });
  await page.goto(`/?debug${touch ? '&touch' : ''}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await expect(page.locator('#letterbox')).toBeVisible();
}

/**
 * Makes the letterbox draw `forced` over whatever the game asks for, for good, so a redraw the game
 * does for its own reasons (a resize, the typewriter) cannot put the real beat back mid-check.
 */
async function force(page: Page, forced: Record<string, unknown>, twoLines = false): Promise<void> {
  await page.evaluate(
    ([over, two]) => {
      const g = (window as unknown as { __lf: Lf }).__lf;
      g.primary();
      const orig = g.ui.showLetterbox.bind(g.ui);
      g.ui.showLetterbox = (o: unknown): void =>
        orig(o && { ...(o as object), ...(over as object), done: true, hidden: '' });
      g.ui.showLetterbox({ place: '', shown: '', pips: '', last: false, skip: true, announce: '' });
      const text = document.querySelector<HTMLElement>('#letterbox .text');
      if (text && two) text.style.whiteSpace = 'pre-line';
    },
    [forced, twoLines] as const,
  );
}

/** Types the beat out, then puts two explicit lines in the bar: the most a beat may take. */
const twoLineBeat = (page: Page, skip: boolean): Promise<void> =>
  force(
    page,
    {
      place: 'Under the treehouse',
      shown: 'First line of a beat\nSecond line of a beat',
      pips: '●●○○○○○○',
      skip,
      announce: 'Under the treehouse. First line of a beat. Second line of a beat',
    },
    true,
  );

const box = (page: Page, selector: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom };
  }, selector);

const overlap = (a: Box, b: Box): boolean => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

const story = (page: Page): Promise<{ scene: number; beat: number; done: boolean }> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.story);

const PHONES = [
  { w: 844, h: 390, dpr: 3 },
  { w: 740, h: 360, dpr: 2.6 },
  { w: 640, h: 320, dpr: 2 },
];

for (const p of PHONES) {
  test.describe(`a phone at ${p.w}x${p.h}`, () => {
    test.use({
      viewport: { width: p.w, height: p.h },
      deviceScaleFactor: p.dpr,
      isMobile: true,
      hasTouch: true,
    });

    for (const screen of ['cine', 'ending'] as const) {
      test(`the ${screen} strip is at most a quarter of the height and leaves most of the art`, async ({
        page,
      }) => {
        await open(page, screen, true);
        await twoLineBeat(page, screen === 'cine');
        const bottom = (await box(page, '#letterbox .bar.bottom'))!;
        // Measured at 19.5, 21.1 and 23.8 % of the height: a quarter, and the art left at 72 %, keep a margin.
        expect(bottom.h / p.h).toBeLessThanOrEqual(0.25);
        expect(1 - bottom.h / p.h).toBeGreaterThanOrEqual(0.72);
        // Nothing runs off the screen, and the page does not scroll.
        expect(bottom.b).toBeLessThanOrEqual(p.h + 0.5);
        expect(bottom.r).toBeLessThanOrEqual(p.w + 0.5);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollHeight - window.innerHeight,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const lines = await page.evaluate(() => {
          const t = document.querySelector('#letterbox .text');
          if (!t) return 0;
          const tops = new Set<number>();
          const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const text = n as Text;
            for (let i = 0; i < text.length; i++) {
              const r = document.createRange();
              r.setStart(text, i);
              r.setEnd(text, i + 1);
              const rect = r.getClientRects()[0];
              if (rect) tops.add(Math.round(rect.top));
            }
          }
          return tops.size;
        });
        expect(lines).toBe(2);
      });
    }

    test('the top bar floats over the art and holds the place, the dots and Skip', async ({
      page,
    }) => {
      await open(page, 'cine', true);
      await twoLineBeat(page, true);
      const bar = await page.evaluate(() => {
        const e = document.querySelector('#letterbox .bar:not(.bottom)');
        if (!e) return null;
        const cs = getComputedStyle(e);
        return { position: cs.position, image: cs.backgroundImage, colour: cs.backgroundColor };
      });
      expect(bar?.position).toBe('absolute');
      expect(bar?.image).toContain('linear-gradient');
      expect(bar?.colour).toBe('rgba(0, 0, 0, 0)');
      const top = (await box(page, '#letterbox .bar:not(.bottom)'))!;
      const bottom = (await box(page, '#letterbox .bar.bottom'))!;
      // The top bar is over the art, not above it: the strip is the only thing that takes height.
      expect(top.y).toBe(0);
      expect(bottom.y + bottom.h).toBeCloseTo(p.h, 0);
      await expect(page.locator('#letterbox .dots')).toBeVisible();
      await expect(page.locator('#letterbox .pips')).toBeHidden();
      await expect(page.locator('#letterbox .dots')).toHaveText('●●○○○○○○');
      expect(top.h / p.h).toBeLessThanOrEqual(0.24);
    });

    test('the place, the dots, Skip, Lab and Pause do not crowd each other', async ({ page }) => {
      await open(page, 'cine', true);
      // The longest place name with the most dots is the widest the left side gets.
      await force(page, {
        place: 'Under the treehouse',
        shown: 'x',
        pips: '●●●●●●●●',
        skip: true,
        announce: 'x',
      });
      const parts: Record<string, Box | null> = {
        place: await box(page, '#letterbox .place'),
        dots: await box(page, '#letterbox .dots'),
        skip: await box(page, '#letterbox .skip'),
        lab: await box(page, '#labBtn'),
        pause: await page.evaluate(() => {
          const g = (window as unknown as { __lf: Lf }).__lf.debugTouch?.face.pause;
          return g
            ? { x: g.cx - g.r, y: g.cy - g.r, w: g.r * 2, h: g.r * 2, r: g.cx + g.r, b: g.cy + g.r }
            : null;
        }),
      };
      for (const k of ['place', 'dots', 'skip', 'lab', 'pause']) {
        expect(parts[k], k).not.toBeNull();
      }
      const names = Object.keys(parts);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          expect(overlap(parts[names[i]!]!, parts[names[j]!]!), `${names[i]} and ${names[j]}`).toBe(
            false,
          );
        }
      }
      expect(parts['skip']!.h).toBeGreaterThanOrEqual(47.9);
      expect(parts['skip']!.r).toBeLessThanOrEqual(parts['pause']!.x);
    });

    test('the arrow button is 48 px, clear of the text and of Select, and keeps its word for a screen reader', async ({
      page,
    }) => {
      await open(page, 'cine', true);
      await twoLineBeat(page, true);
      const next = (await box(page, '#letterbox .next'))!;
      expect(Math.min(next.w, next.h)).toBeGreaterThanOrEqual(47.9);
      await expect(page.locator('#letterbox .next .arrow')).toBeVisible();
      await expect(page.locator('#letterbox .next .arrow')).toHaveText('↓');
      await expect(page.locator('#letterbox .next .lbl')).toHaveText('Continue');
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      const text = (await box(page, '#letterbox .text'))!;
      expect(text.r).toBeLessThanOrEqual(next.x);
      const select = await page.evaluate(
        () => (window as unknown as { __lf: Lf }).__lf.debugTouch?.face.jump,
      );
      expect(select).toBeTruthy();
      const s = select!;
      const sel = {
        x: s.cx - s.r,
        y: s.cy - s.r,
        w: s.r * 2,
        h: s.r * 2,
        r: s.cx + s.r,
        b: s.cy + s.r,
      };
      expect(overlap(next, sel)).toBe(false);
      expect(overlap(text, sel)).toBe(false);
    });

    test('the last button of the intro keeps its word', async ({ page }) => {
      await open(page, 'cine', true);
      await force(page, {
        place: 'The crystal forest',
        shown: 'x',
        pips: '●●●●●●●●',
        last: true,
        skip: true,
        announce: 'x',
      });
      await expect(page.locator('#letterbox .next .lbl')).toBeVisible();
      await expect(page.locator('#letterbox .next .lbl')).toHaveText('Step out');
      await expect(page.locator('#letterbox .next .arrow')).toBeHidden();
      const next = (await box(page, '#letterbox .next'))!;
      expect(Math.min(next.w, next.h)).toBeGreaterThanOrEqual(47.9);
    });

    test('a display cutout pushes the strip and the top bar in', async ({ page }) => {
      await open(page, 'cine', true);
      await page.evaluate(() => {
        const s = document.documentElement.style;
        s.setProperty('--lf-safe-top', '12px');
        s.setProperty('--lf-safe-bottom', '14px');
        s.setProperty('--lf-safe-left', '44px');
        s.setProperty('--lf-safe-right', '44px');
      });
      await twoLineBeat(page, true);
      const text = (await box(page, '#letterbox .text'))!;
      const next = (await box(page, '#letterbox .next'))!;
      const place = (await box(page, '#letterbox .place'))!;
      const bottom = (await box(page, '#letterbox .bar.bottom'))!;
      expect(text.x).toBeGreaterThanOrEqual(44);
      expect(next.r).toBeLessThanOrEqual(p.w - 44);
      expect(place.x).toBeGreaterThanOrEqual(44);
      expect(place.y).toBeGreaterThanOrEqual(12);
      expect(Math.max(text.b, next.b)).toBeLessThanOrEqual(bottom.b - 14);
    });

    test('one tap on the arrow finishes the beat, the next moves on, and the art stays for the scene', async ({
      page,
    }) => {
      await open(page, 'cine', true);
      // A short beat can finish typing before a slow machine's first tap lands, so slow the typewriter
      // to a crawl and let the tap be what finishes it.
      await page.evaluate(() => {
        const g = (window as unknown as { __lf: { story: { cps: number } } }).__lf;
        g.story.cps = 0.5;
      });
      const before = await story(page);
      expect(before.done).toBe(false);
      // Playwright waits for the button to stop moving before it taps, as a finger would.
      const tapNext = (): Promise<void> => page.locator('#letterbox .next').tap();
      await tapNext();
      await expect.poll(async () => (await story(page)).done).toBe(true);
      const typed = await story(page);
      expect([typed.scene, typed.beat]).toEqual([before.scene, before.beat]);
      await expect(page.locator('#letterbox .next .lbl')).toHaveText('Continue');
      await tapNext();
      await expect
        .poll(async () => {
          const s = await story(page);
          return s.scene !== before.scene || s.beat !== before.beat;
        })
        .toBe(true);
    });
  });
}

for (const win of [
  { name: 'a desktop window', w: 1280, h: 720 },
  { name: 'a short desktop window', w: 844, h: 390 },
]) {
  test.describe(win.name, () => {
    test.use({ viewport: { width: win.w, height: win.h } });

    for (const screen of ['cine', 'ending'] as const) {
      test(`keeps the opaque bars of the ${screen} screen, the word and the dots in the foot`, async ({
        page,
      }) => {
        await open(page, screen, false);
        await twoLineBeat(page, screen === 'cine');
        const bars = await page.evaluate(() => {
          const style = (sel: string): Record<string, string> | null => {
            const e = document.querySelector(sel);
            if (!e) return null;
            const cs = getComputedStyle(e);
            return {
              position: cs.position,
              image: cs.backgroundImage,
              colour: cs.backgroundColor,
              display: cs.display,
              minHeight: cs.minHeight,
              lineHeight: cs.lineHeight,
              maxWidth: cs.maxWidth,
            };
          };
          return {
            top: style('#letterbox .bar:not(.bottom)'),
            bottom: style('#letterbox .bar.bottom'),
            text: style('#letterbox .bar.bottom .text'),
            next: style('#letterbox .next'),
            inFoot: !!document.querySelector('#letterbox .bar.bottom .foot .pips'),
          };
        });
        expect(bars.top?.position).toBe('static');
        expect(bars.top?.colour).toBe('rgb(0, 0, 0)');
        expect(bars.top?.image).toBe('none');
        expect(bars.bottom?.display).toBe('flex');
        expect(bars.bottom?.colour).toBe('rgb(0, 0, 0)');
        // Three lines of room for the text, and the text keeps its column width.
        expect(parseFloat(bars.text?.minHeight ?? '0')).toBeCloseTo(
          3 * parseFloat(bars.text?.lineHeight ?? '0'),
          0,
        );
        expect(bars.text?.maxWidth).not.toBe('none');
        expect(bars.inFoot).toBe(true);
        await expect(page.locator('#letterbox .pips')).toBeVisible();
        await expect(page.locator('#letterbox .dots')).toBeHidden();
        await expect(page.locator('#letterbox .next .lbl')).toBeVisible();
        await expect(page.locator('#letterbox .next .arrow')).toBeHidden();
        const top = (await box(page, '#letterbox .bar:not(.bottom)'))!;
        const bottom = (await box(page, '#letterbox .bar.bottom'))!;
        // The bars sit above and below the art, as they always have.
        expect(top.y).toBe(0);
        expect(top.b).toBeLessThan(bottom.y);
        expect(bottom.b).toBeCloseTo(win.h, 0);
      });
    }
  });
}
