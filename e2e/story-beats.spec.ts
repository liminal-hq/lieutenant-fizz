// Browser checks of the story screens' beats: complete-then-advance, the dots and what a screen reader reads.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil } from './keys';

interface StoryView {
  scene: number;
  beat: number;
  text: string;
  done: boolean;
  last: boolean;
  pips: string;
}
interface Lf {
  debugShow(s: string): void;
  debugState: { screen: string; story: StoryView };
}

const story = (page: Page): Promise<StoryView> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.story);

/** Opens the opening cinematic from the debug hook, with the sound muted by the options. */
async function openCine(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('lf-ep1-options-v1', JSON.stringify({ v: 1, audio: 0, music: 0, sfx: 0 }));
  });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 30_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('cine'));
  await expect(page.locator('#letterbox')).toBeVisible();
}

test('Enter finishes the beat first, then moves to the next', async ({ page }) => {
  await openCine(page);
  const first = await story(page);
  expect([first.scene, first.beat]).toEqual([0, 0]);
  await pressUntil(page, 'Enter', () => {
    const s = (window as unknown as { __lf: Lf }).__lf.debugState.story;
    return s.done;
  });
  const typed = await story(page);
  expect([typed.scene, typed.beat, typed.done]).toEqual([0, 0, true]);
  await expect(page.locator('#letterbox .hidden-text')).toHaveText('');
  await expect(page.locator('#letterbox .next')).toHaveText('Continue');
  await pressUntil(page, 'Enter', () => {
    const s = (window as unknown as { __lf: Lf }).__lf.debugState.story;
    return s.scene !== 0 || s.beat !== 0;
  });
  const next = await story(page);
  expect(next.done).toBe(false);
  expect(next.text).not.toBe(first.text);
});

test('the dots count scenes', async ({ page }) => {
  await openCine(page);
  const first = await story(page);
  expect(first.pips).toBe('●○○○○○○○');
  await expect(page.locator('#letterbox .pips')).toHaveText(first.pips);
});

test('a screen reader gets the whole beat once, with the place when the scene starts', async ({
  page,
}) => {
  await openCine(page);
  const region = page.locator('#letterbox');
  await expect(region).toHaveAttribute('role', 'region');
  await expect(region).toHaveAttribute('aria-label', 'Story');
  const live = page.locator('#letterbox .sr');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveAttribute('aria-atomic', 'true');
  // The typed text is hidden from a screen reader, so it never reads half a line.
  await expect(page.locator('#letterbox .text')).toHaveAttribute('aria-hidden', 'true');
  const first = await story(page);
  await expect(live).toHaveText(`The backyard. ${first.text}`);
  // Typing does not change what was announced.
  await expect.poll(async () => (await story(page)).done).toBe(true);
  await expect(live).toHaveText(`The backyard. ${first.text}`);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a beat is whole as soon as it shows, so one press advances', async ({ page }) => {
    await openCine(page);
    const first = await story(page);
    expect(first.done).toBe(true);
    await expect(page.locator('#letterbox .hidden-text')).toHaveText('');
    await pressUntil(page, 'Enter', () => {
      const s = (window as unknown as { __lf: Lf }).__lf.debugState.story;
      return s.scene !== 0 || s.beat !== 0;
    });
    expect((await story(page)).done).toBe(true);
  });
});
