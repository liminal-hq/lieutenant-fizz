// Browser checks for the replay on a landscape phone: the bar's buttons are big enough to touch and everything fits.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { settle } from './keys';

interface Lf {
  startSample(): Promise<boolean>;
  stopSample(): Promise<void>;
  debugShow(s: string): void;
  debugWatch(id?: string): Promise<boolean>;
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

test('the replay fits a landscape phone, with buttons a thumb can hit, and the touch layer is on', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  expect(await lf(page, (g) => g.startSample())).toBe(true);
  await lf(page, (g) => g.debugShow('play'));
  await settle(page, 10);
  await page.waitForTimeout(800);
  await lf(page, (g) => g.stopSample());
  expect(await lf(page, (g) => g.debugWatch())).toBe(true);
  await expect(page.locator('#replay')).toBeVisible();
  // The game's own touch controls give way to the replay's.
  await expect(page.locator('#touch')).toBeHidden();

  const viewport = page.viewportSize()!;
  const buttons = page.locator('#replay .replay-bar .replay-btn:visible');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(8);
  for (let i = 0; i < count; i += 1) {
    const box = (await buttons.nth(i).boundingBox())!;
    expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(44);
    expect(box.width, `button ${i}`).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width, `button ${i}`).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height, `button ${i}`).toBeLessThanOrEqual(viewport.height + 0.5);
  }

  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#replay'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems.pageOverflow).toEqual([]);
  expect(errors).toEqual([]);
});
