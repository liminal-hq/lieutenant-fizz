// Browser check that every packed page of the intro and the ending fits the lines the strip allows, and the taps.
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
    storyPack: { allowed: number; share: number; over: boolean[][]; pageCounts: number[] } | null;
  };
  story: { scenes: { beats: string[] }[] };
}

interface Visit {
  scene: number;
  beat: number;
  text: string;
  lines: number;
  /** The lines allowed when the page was packed. */
  allowed: number;
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
  /** The pages joined by scene, and the beats joined by scene: equal when nothing is lost or repeated. */
  pagesByScene: string[];
  beatsByScene: string[];
  over: boolean[][];
  pageCounts: number[];
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
    const allowed = g.debugState.storyPack?.allowed ?? 0;
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
        allowed,
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
    const pagesByScene: string[] = [];
    for (const v of visits) {
      pagesByScene[v.scene] = pagesByScene[v.scene] ? `${pagesByScene[v.scene]} ${v.text}` : v.text;
    }
    const pack = g.debugState.storyPack;
    return {
      visits,
      advances,
      presses,
      screenAfter: g.debugState.screen,
      pagesByScene,
      beatsByScene: g.story.scenes.map((sc) => sc.beats.join(' ')),
      over: pack?.over ?? [],
      pageCounts: pack?.pageCounts ?? [],
    };
  }, screen);
}

/**
 * The sizes, with what packing is expected to give at each: the lines a page may take (three where the
 * strip stays within about 30 % of the height, otherwise two) and the pages, so the taps, of each screen.
 * Before packing the intro took 40 taps and the ending 12.
 */
const SIZES = [
  {
    name: 'a phone at 844x390',
    w: 844,
    h: 390,
    dpr: 3,
    touch: true,
    lines: 3,
    intro: 16,
    ending: 4,
  },
  {
    name: 'a phone at 740x360',
    w: 740,
    h: 360,
    dpr: 2.6,
    touch: true,
    lines: 3,
    intro: 22,
    ending: 7,
  },
  {
    name: 'a phone at 640x320',
    w: 640,
    h: 320,
    dpr: 2,
    touch: true,
    lines: 2,
    intro: 36,
    ending: 12,
  },
  {
    name: 'a desktop window at 1280x720',
    w: 1280,
    h: 720,
    dpr: 1,
    touch: false,
    lines: 3,
    intro: 16,
    ending: 4,
  },
];

/** Opens the page once, muted, as a phone or a desktop window. */
async function boot(page: Page, touch: boolean): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, audio: 0, music: 0, sfx: 0 }));
  });
  await page.goto(`/?debug${touch ? '&touch' : ''}`);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
}

for (const p of SIZES) {
  test.describe(p.name, () => {
    test.use({
      viewport: { width: p.w, height: p.h },
      deviceScaleFactor: p.dpr,
      isMobile: p.touch,
      hasTouch: p.touch,
    });

    test(`the packed pages of the intro fit ${p.lines} lines, and it takes ${p.intro} taps`, async ({
      page,
    }) => {
      await boot(page, p.touch);
      const w = await walk(page, 'cine');
      expect(w.visits).toHaveLength(p.intro);
      expect(w.advances).toBe(p.intro);
      expect(w.presses).toBe(p.intro * 2);
      expect(w.screenAfter).toBe('play');
      // Nothing lost or repeated: each scene's pages joined are its beats joined.
      expect(w.pagesByScene).toEqual(w.beatsByScene);
      // No page is too long for the box, and none is a lone beat that overflows.
      expect(w.over.flat().some(Boolean)).toBe(false);
      const tooLong = w.visits.filter((v) => v.lines > p.lines).map((v) => `${v.lines}: ${v.text}`);
      expect(tooLong).toEqual([]);
      for (const v of w.visits) {
        expect(v.allowed, v.text).toBe(p.lines);
        expect(v.lines, v.text).toBeLessThanOrEqual(v.allowed);
        expect(v.shownEqualsText, v.text).toBe(true);
        if (p.touch) {
          // About 30 % of the height with three lines, 25 % with two.
          expect(v.barShare, v.text).toBeLessThanOrEqual(p.lines === 3 ? 0.3 : 0.25);
          expect(v.barBottom, v.text).toBeLessThanOrEqual(p.h + 0.5);
          expect(v.textRight, v.text).toBeLessThanOrEqual(v.nextLeft);
        }
        // The art holds for the pages of a scene, and moves on with the scene.
        expect(v.stage, v.text).toBe(v.scene);
        expect(v.typing, v.text).toBe('Hurry');
      }
      // The words: "Continue" on every page but the last, which keeps "Step out".
      expect(w.visits.slice(0, -1).every((v) => v.typed === 'Continue')).toBe(true);
      expect(w.visits.at(-1)?.typed).toBe('Step out');
      // The saucer waits in the Liftoff scene until the page that opens the hatch, which starts at that beat.
      const liftoff = w.visits.filter((v) => v.scene === 2);
      expect(liftoff.map((v) => v.waiting)).toEqual([true, ...liftoff.slice(1).map(() => false)]);
      expect(liftoff[0]?.text).not.toMatch(/hatch in the lawn/);
      expect(liftoff.find((v) => !v.waiting)?.text).toMatch(/^A hatch in the lawn slid open\./);
      expect(w.visits.filter((v) => v.scene !== 2).every((v) => !v.waiting)).toBe(true);
      // Every scene has a page, and the dots count scenes (8).
      expect(new Set(w.visits.map((v) => v.scene)).size).toBe(8);
    });

    test(`the packed pages of the ending fit ${p.lines} lines, and it takes ${p.ending} taps`, async ({
      page,
    }) => {
      await boot(page, p.touch);
      const w = await walk(page, 'ending');
      expect(w.visits).toHaveLength(p.ending);
      expect(w.advances).toBe(p.ending);
      expect(w.presses).toBe(p.ending * 2);
      expect(w.screenAfter).toBe('credits');
      expect(w.pagesByScene).toEqual(w.beatsByScene);
      expect(w.over.flat().some(Boolean)).toBe(false);
      const tooLong = w.visits.filter((v) => v.lines > p.lines).map((v) => `${v.lines}: ${v.text}`);
      expect(tooLong).toEqual([]);
      for (const v of w.visits) {
        expect(v.allowed, v.text).toBe(p.lines);
        expect(v.shownEqualsText, v.text).toBe(true);
        if (p.touch) {
          expect(v.barShare, v.text).toBeLessThanOrEqual(p.lines === 3 ? 0.3 : 0.25);
          expect(v.barBottom, v.text).toBeLessThanOrEqual(p.h + 0.5);
          expect(v.textRight, v.text).toBeLessThanOrEqual(v.nextLeft);
        }
        expect(v.typing, v.text).toBe('Hurry');
        // The ending has no "Step out": the last page is a plain Continue, as before.
        expect(v.typed, v.text).toBe('Continue');
      }
      expect(new Set(w.visits.map((v) => v.scene)).size).toBe(4);
    });
  });
}
