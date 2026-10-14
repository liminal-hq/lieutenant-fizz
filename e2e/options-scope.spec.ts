// Browser checks for what an Options change applies to: every episode, or this one alone, with a * on what it overrides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Lf {
  debugShow(s: string): void;
}

const FILE = 'lf-options-v1';

async function openOptions(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    const lf = (window as unknown as { __lf: Lf }).__lf;
    lf.debugShow('title');
    lf.debugShow('options');
  });
  await expect(page.locator('#ui .menu button', { hasText: 'Applies to' })).toBeVisible();
  return errors;
}

const row = (page: Page, text: string) =>
  page.locator('#ui .menu:visible button', { hasText: text }).first();

const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), FILE) as Promise<{
    global?: Record<string, unknown>;
    episodes?: Record<string, Record<string, unknown>>;
  }>;

test.describe('what an Options change applies to', () => {
  test('starts on All episodes, and a change goes to the app-wide values', async ({ page }) => {
    const errors = await openOptions(page);
    await expect(row(page, 'Applies to')).toContainText('All episodes');
    await row(page, 'Text size').click();
    await expect(row(page, 'Text size')).toContainText('Large');
    await expect.poll(async () => (await saved(page)).global?.['text']).toBe(1);
    expect((await saved(page)).episodes?.['episode-1']?.['text']).toBeUndefined();
    await expect(row(page, 'Text size')).not.toContainText('*');
    expect(errors).toEqual([]);
  });

  test('on This episode a change is kept for this episode only, and the row shows a star', async ({
    page,
  }) => {
    const errors = await openOptions(page);
    await row(page, 'Applies to').click();
    await expect(row(page, 'Applies to')).toContainText('This episode');
    await row(page, 'Motion').click();
    await expect.poll(async () => (await saved(page)).episodes?.['episode-1']?.['motion']).toBe(1);
    expect((await saved(page)).global?.['motion']).toBeUndefined();
    await expect(row(page, 'Motion')).toContainText('*');
    expect(errors).toEqual([]);
  });

  test("a change for All episodes drops this episode's override of that option", async ({
    page,
  }) => {
    const errors = await openOptions(page);
    await row(page, 'Applies to').click();
    await row(page, 'Motion').click();
    await expect(row(page, 'Motion')).toContainText('*');
    await row(page, 'Applies to').click();
    await expect(row(page, 'Applies to')).toContainText('All episodes');
    await row(page, 'Motion').click();
    await expect(row(page, 'Motion')).not.toContainText('*');
    await expect
      .poll(async () => (await saved(page)).episodes?.['episode-1']?.['motion'])
      .toBeUndefined();
    expect(errors).toEqual([]);
  });
});
