// Browser checks of page packing in the story: re-packing on a layout change, the Liftoff cue, taps and reduced motion.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface StoryView {
  scene: number;
  beat: number;
  page: number;
  pageCount: number;
  text: string;
  shown: string;
  hidden: string;
  done: boolean;
}
interface Lf {
  debugShow(s: string): void;
  debugStoryTo(scene: number, page?: number): void;
  primary(): void;
  cine: { stage: number; waiting: boolean };
  ui: { storyMeasure: { measures: number } };
  debugState: {
    screen: string;
    story: StoryView;
    storyPack: { allowed: number; width: number; pageCounts: number[] } | null;
  };
}

const lf = (page: Page) => ({
  story: (): Promise<StoryView> =>
    page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.story),
  pack: (): Promise<{ allowed: number; width: number; pageCounts: number[] }> =>
    page.evaluate(
      () =>
        (window as unknown as { __lf: Lf }).__lf.debugState
          .storyPack as Lf['debugState']['storyPack'] & object,
    ),
  waiting: (): Promise<boolean> =>
    page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.cine.waiting),
  /** Types the page out, with the game's own press (a press while typing completes the page). */
  finish: (): Promise<void> =>
    page.evaluate(() => {
      const g = (window as unknown as { __lf: Lf }).__lf;
      if (!g.debugState.story.done) g.primary();
    }),
  to: (scene: number, pg = 0): Promise<void> =>
    page.evaluate(([s, n]) => (window as unknown as { __lf: Lf }).__lf.debugStoryTo(s!, n), [
      scene,
      pg,
    ] as const),
});

/** Opens the intro (or the ending) as a phone at 844x390 unless told otherwise, muted. */
async function open(page: Page, screen: 'cine' | 'ending' = 'cine'): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, audio: 0, music: 0, sfx: 0 }));
  });
  await page.goto('/?debug&touch');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
  await page.evaluate((s) => (window as unknown as { __lf: Lf }).__lf.debugShow(s), screen);
  await expect(page.locator('#letterbox')).toBeVisible();
}

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('a turn to a smaller screen re-packs and keeps the place, and back again', async ({
    page,
  }) => {
    await open(page);
    const g = lf(page);
    expect((await g.pack()).allowed).toBe(3);
    // The Stratosphere at 844 wide: two pages, the second beginning at beat 3.
    await g.to(3, 1);
    await g.finish();
    const wide = await g.story();
    expect([wide.scene, wide.page, wide.pageCount, wide.beat]).toEqual([3, 1, 2, 3]);

    await page.setViewportSize({ width: 640, height: 320 });
    await expect.poll(async () => (await g.pack()).allowed).toBe(2);
    const narrow = await g.story();
    // Six pages now, and the player is on the one that starts where the wide page did.
    expect([narrow.scene, narrow.pageCount, narrow.beat]).toEqual([3, 6, 3]);
    expect(narrow.text.startsWith('painting a crimson streak')).toBe(true);
    // The dots still count scenes.
    await expect(page.locator('#letterbox .dots')).toHaveText('●●●●○○○○');

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await g.pack()).allowed).toBe(3);
    const back = await g.story();
    expect(back.scene).toBe(3);
    expect([back.beat, back.page, back.pageCount]).toEqual([3, 1, 2]);
  });

  test('a re-pack that gives the same page does not type it again', async ({ page }) => {
    await open(page);
    const g = lf(page);
    await g.to(1, 0);
    await g.finish();
    const before = await g.story();
    expect(before.done).toBe(true);
    const width = (await g.pack()).width;
    // One pixel narrower: the text box changes, the page does not.
    await page.setViewportSize({ width: 843, height: 390 });
    await expect.poll(async () => (await g.pack()).width).not.toBe(width);
    const after = await g.story();
    expect(after.text).toBe(before.text);
    expect(after.done).toBe(true);
    expect(after.hidden).toBe('');
  });

  test('fullscreen and the font arriving measure the text box again', async ({ page }) => {
    await open(page);
    const measures = (): Promise<number> =>
      page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.ui.storyMeasure.measures);
    const first = await measures();
    await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    await expect.poll(measures).toBeGreaterThan(first);
    const second = await measures();
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await expect.poll(measures).toBeGreaterThan(second);
  });

  test('the Liftoff launch waits for the page that opens the hatch, through a re-pack', async ({
    page,
  }) => {
    await open(page);
    const g = lf(page);
    const hatch = /^A hatch in the lawn slid open\./;
    await g.to(2, 0);
    expect(await g.waiting()).toBe(true);
    await g.finish();
    await page.setViewportSize({ width: 640, height: 320 });
    await expect.poll(async () => (await g.pack()).allowed).toBe(2);
    // Still on the page before the hatch, so the saucer still waits.
    expect((await g.story()).text).not.toMatch(hatch);
    expect(await g.waiting()).toBe(true);
    // The next page starts at the hatch beat, and only now does the launch begin.
    await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.primary());
    const next = await g.story();
    expect(next.text).toMatch(hatch);
    expect(next.beat).toBe(1);
    expect(await g.waiting()).toBe(false);
    // Re-packing on the hatch page keeps it, and the launch stays on.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await g.pack()).allowed).toBe(3);
    expect((await g.story()).text).toMatch(hatch);
    expect(await g.waiting()).toBe(false);
  });

  test('a tap on the arrow completes the page, and the next one moves on a whole page', async ({
    page,
  }) => {
    await open(page);
    const g = lf(page);
    // Slowed to a crawl so the tap, not the typewriter, finishes the page.
    await page.evaluate(() => {
      (window as unknown as { __lf: { story: { cps: number } } }).__lf.story.cps = 0.5;
    });
    const first = await g.story();
    // Three of the scene's four beats on the first page.
    expect([first.scene, first.page, first.pageCount, first.beat]).toEqual([0, 0, 2, 0]);
    expect(first.text).toContain('Billy wasn’t there'.replace('’', "'"));
    await page.locator('#letterbox .next').click();
    await expect.poll(async () => (await g.story()).done).toBe(true);
    expect((await g.story()).page).toBe(0);
    await page.locator('#letterbox .next').click();
    await expect.poll(async () => (await g.story()).page).toBe(1);
    const second = await g.story();
    expect(second.beat).toBe(3);
    expect(second.text).toBe('Warm light was spilling out.');
    expect(second.done).toBe(false);
    // The dots count scenes, so they have not moved.
    await expect(page.locator('#letterbox .dots')).toHaveText('●○○○○○○○');
  });

  test('Skip still leaves the whole sequence from any page', async ({ page }) => {
    await open(page);
    await lf(page).to(4, 1);
    await page.locator('#letterbox .skip').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.screen))
      .toBe('play');
  });

  test('a screen reader gets the whole page, with the place on the first page of a scene', async ({
    page,
  }) => {
    await open(page);
    const g = lf(page);
    const live = page.locator('#letterbox .sr');
    const first = await g.story();
    await expect(live).toHaveText(`The backyard. ${first.text}`);
    await g.to(1, 1);
    const later = await g.story();
    await expect(live).toHaveText(later.text);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('a whole page shows at once', async ({ page }) => {
      await open(page);
      const g = lf(page);
      const first = await g.story();
      expect(first.done).toBe(true);
      // A page, not a beat: the first page holds three beats.
      expect(first.text.length).toBeGreaterThan(120);
      expect(first.hidden).toBe('');
      await g.to(1, 1);
      expect((await g.story()).done).toBe(true);
    });
  });
});
