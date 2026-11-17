// Browser checks that a pad press shorter than a fixed tick still reaches the sim, with fast polling on, and that `?debug&latch=off` restores the old read.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { settle } from './keys';

const JUMP = 16;

type Lf = { debugShow(s: string): void; debugPollLog(on: boolean): number[] };

/** A pad that is connected from the start, driven from the test with `__pad`. */
async function stubPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = {
      index: 0,
      id: 'Test Pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      buttons,
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    // A plain object stands in for a Gamepad, which has no public constructor.
    navigator.getGamepads = (() => [
      pad,
      null,
      null,
      null,
    ]) as unknown as typeof navigator.getGamepads;
  });
}

/** Taps A for about 5 ms, ten times with a gap, in the page, and returns every fixed tick's input word. */
async function tapTen(page: Page, url: string): Promise<number[]> {
  await stubPad(page);
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  await settle(page, 10);
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugPollLog(true));
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
        let n = 0;
        const tap = (): void => {
          pad.buttons[0]!.pressed = true;
          setTimeout(() => {
            pad.buttons[0]!.pressed = false;
            if (++n < 10) setTimeout(tap, 90);
            else setTimeout(done, 120);
          }, 5);
        };
        tap();
      }),
  );
  return page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugPollLog(false));
}

/** How many separate presses the sim saw: runs of consecutive ticks with Jump held. */
const presses = (words: number[]): number =>
  words.filter((w, i) => (w & JUMP) !== 0 && (i === 0 || (words[i - 1]! & JUMP) === 0)).length;

test('a 5 ms pad press reaches the sim as a Jump each time', async ({ page }) => {
  // A timer that runs late can stretch a tap over two ticks, but never lose one or join two (they are 90 ms apart).
  expect(presses(await tapTen(page, '/?debug'))).toBe(10);
});

test('with latch=off the old read loses some of them', async ({ page }) => {
  expect(presses(await tapTen(page, '/?debug&latch=off'))).toBeLessThan(10);
});
