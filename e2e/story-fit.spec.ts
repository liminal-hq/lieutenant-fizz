// Browser check that every beat of the intro fits two lines in the phone strip, and how many taps it takes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Lf {
  debugShow(s: string): void;
  primary(): void;
  cine: { stage: number; waiting: boolean };
  debugState: {
    screen: string;
    story: { scene: number; beat: number; text: string; done: boolean; last: boolean };
  };
}

interface Visit {
  scene: number;
  beat: number;
  text: string;
  lines: number;
  barShare: number;
  barBottom: number;
  textRight: number;
  nextLeft: number;
  /** The button's word while the beat types, and once it is typed. */
  typing: string;
  typed: string;
  stage: number;
  waiting: boolean;
  shownEqualsText: boolean;
}

interface Walk {
  visits: Visit[];
  /** The presses that moved on (the others only finished a beat being typed). */
  advances: number;
  /** All presses, finishing a beat included. */
  presses: number;
  screenAfter: string;
}

/**
 * Plays a story screen from its first beat to the end with the game's own press, rendering each beat in
 * the real bar: finish the beat, measure it, move on. Everything runs inside the page in one pass, so
 * each beat is measured as it is drawn and the check does not wait on the typewriter.
 */
async function walk(page: Page, screen: 'cine' | 'ending'): Promise<Walk> {
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await expect(page.locator('#letterbox')).toBeVisible();
  return page.evaluate((s) => {
    const g = (window as unknown as { __lf: Lf }).__lf;
    const q = (sel: string): HTMLElement => document.querySelector<HTMLElement>(sel)!;
    const lineCount = (): number => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(q('#letterbox .text'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n as Text;
        for (let i = 0; i < t.length; i++) {
          const r = document.createRange();
          r.setStart(t, i);
          r.setEnd(t, i + 1);
          const rect = r.getClientRects()[0];
          if (rect) tops.add(Math.round(rect.top));
        }
      }
      return tops.size;
    };
    const visits: Visit[] = [];
    let advances = 0;
    let presses = 0;
    while (g.debugState.screen === s && presses < 400) {
      const typing = q('#letterbox .next .lbl').textContent ?? '';
      if (!g.debugState.story.done) {
        g.primary();
        presses++;
      }
      const v = g.debugState.story;
      const bar = q('#letterbox .bar.bottom').getBoundingClientRect();
      visits.push({
        scene: v.scene,
        beat: v.beat,
        text: v.text,
        lines: lineCount(),
        barShare: bar.height / window.innerHeight,
        barBottom: bar.bottom,
        textRight: q('#letterbox .text').getBoundingClientRect().right,
        nextLeft: q('#letterbox .next').getBoundingClientRect().left,
        typing,
        typed: q('#letterbox .next .lbl').textContent ?? '',
        stage: g.cine.stage,
        waiting: g.cine.waiting,
        shownEqualsText: q('#letterbox .shown').textContent === v.text,
      });
      g.primary();
      presses++;
      advances++;
    }
    return { visits, advances, presses, screenAfter: g.debugState.screen };
  }, screen);
}

const PHONES = [
  { w: 844, h: 390, dpr: 3 },
  { w: 740, h: 360, dpr: 2.6 },
  { w: 640, h: 320, dpr: 2 },
];

/** Opens the page once, muted, as a phone. */
async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, audio: 0, music: 0, sfx: 0 }));
  });
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
}

for (const p of PHONES) {
  test.describe(`a phone at ${p.w}x${p.h}`, () => {
    test.use({
      viewport: { width: p.w, height: p.h },
      deviceScaleFactor: p.dpr,
      isMobile: true,
      hasTouch: true,
    });

    test('every beat of the intro is two lines or fewer in the strip, and it takes 40 taps', async ({
      page,
    }) => {
      await boot(page);
      const w = await walk(page, 'cine');
      // 40 beats, so 40 taps to the map (twice that if each beat is also finished by a tap).
      expect(w.visits).toHaveLength(40);
      expect(w.advances).toBe(40);
      expect(w.presses).toBe(80);
      expect(w.screenAfter).toBe('play');
      const tooLong = w.visits.filter((v) => v.lines > 2).map((v) => `${v.lines}: ${v.text}`);
      expect(tooLong).toEqual([]);
      for (const v of w.visits) {
        expect(v.shownEqualsText, v.text).toBe(true);
        expect(v.barShare, v.text).toBeLessThanOrEqual(0.25);
        expect(v.barBottom, v.text).toBeLessThanOrEqual(p.h + 0.5);
        expect(v.textRight, v.text).toBeLessThanOrEqual(v.nextLeft);
        // The art holds for the beats of a scene, and moves on with the scene.
        expect(v.stage, v.text).toBe(v.scene);
        expect(v.typing, v.text).toBe('Hurry');
      }
      // The words: "Continue" on every beat but the last, which keeps "Step out".
      expect(w.visits.slice(0, -1).every((v) => v.typed === 'Continue')).toBe(true);
      expect(w.visits.at(-1)?.typed).toBe('Step out');
      // The saucer waits in the Liftoff scene until the beat that opens the hatch.
      const liftoff = w.visits.filter((v) => v.scene === 2);
      expect(liftoff.map((v) => v.waiting)).toEqual([true, false, false]);
      expect(w.visits.filter((v) => v.scene !== 2).every((v) => !v.waiting)).toBe(true);
    });
  });
}
