// A key press for the browser specs that waits for its effect, so it never depends on how fast the machine is.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Page } from '@playwright/test';

/**
 * Holds `key` down until `done` reports, inside the page, the change the press should cause, then
 * lifts it at once.
 *
 * The game reads the keyboard once a frame, so a bare press can fall between two frames, and a
 * press held for a fixed time can run into the menu's auto-repeat (350 ms) on a slow frame rate.
 * Holding until the effect shows means a frame saw the key; lifting right after means it is not
 * held long enough to repeat. `done` runs in the page on every animation frame, not over the
 * protocol, so a slow test process cannot delay seeing the change (and so the key coming up), and
 * it must be true only after the press has acted. It cannot use anything from the test's scope;
 * pass what it needs as the string `arg`.
 */
export async function pressUntil(
  page: Page,
  key: string,
  done: (arg: string) => boolean,
  arg = '',
): Promise<void> {
  // The page shows a new screen before the game's next frame notices the change, and a direction
  // held when it notices is ignored until it comes up (so it cannot move the new menu). Let the
  // game take a few frames first, or a press right after opening a screen is swallowed.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 3;
        const tick = (): void => (--frames > 0 ? void requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(done, arg, { polling: 'raf', timeout: 10_000 });
  } finally {
    await page.keyboard.up(key);
  }
}
