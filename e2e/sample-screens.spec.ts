// Browser checks for Options > Play sample: the consent pages, starting and stopping, the REC mark, and the saved list.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { readZip } from '../packages/engine/src/zip-test-util';
import { pressUntil, settle } from './keys';

interface Lf {
  debugShow(s: string): void;
  startSample(): Promise<boolean>;
  stopSample(): Promise<void>;
  sampling: boolean;
  debugState: { sub: string | null };
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

const title = (page: Page) => page.locator('#overlay h2');
const labels = (page: Page) => page.locator('#overlay .menu button .lbl').allInnerTexts();

/** Presses Down until the row with this label is selected, then Enter until the screen's title changes to `to`. */
async function choose(page: Page, row: string, to: string): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    if ((await page.locator('#overlay .menu button.sel .lbl').innerText()) === row) break;
    await pressUntil(
      page,
      'ArrowDown',
      (was) => document.querySelector('#overlay .menu button.sel .lbl')?.textContent !== was,
      await page.locator('#overlay .menu button.sel .lbl').innerText(),
    );
  }
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText(row);
  await pressUntil(
    page,
    'Enter',
    (want) => document.querySelector('#overlay h2')?.textContent === want,
    to,
  );
  await expect(title(page)).toHaveText(to);
}

async function openPlaySample(page: Page): Promise<void> {
  await lf(page, (g) => g.debugShow('options'));
  await choose(page, 'Play sample', 'Play sample');
}

test('the consent comes in three pages and recording starts only from the last', async ({
  page,
}) => {
  const errors = await boot(page);
  await openPlaySample(page);
  expect(await labels(page)).toEqual(['Record a sample', 'Saved samples', 'Back']);
  await expect(page.locator('#overlay .menu button', { hasText: 'Record a sample' })).toContainText(
    'Off',
  );

  await choose(page, 'Record a sample', 'What is recorded');
  await expect(page.locator('#overlay .text')).toContainText('Every key, button and touch');
  expect(await labels(page)).toEqual(['Next', 'Back']);
  expect(await lf(page, (g) => g.sampling)).toBe(false);

  await choose(page, 'Next', 'What is not recorded');
  await expect(page.locator('#overlay .text')).toContainText('advertising ID');
  await choose(page, 'Next', 'Where it goes');
  await expect(page.locator('#overlay .text')).toContainText('Nothing is sent anywhere');
  expect(await labels(page)).toEqual(['Start recording', 'Back']);
  expect(await lf(page, (g) => g.sampling)).toBe(false);

  // None of the pages crowds, clips or overflows the window.
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#ui'] });
  expect(checked).toBeGreaterThan(2);
  expect(problems.pageOverflow).toEqual([]);
  expect(problems.clipped).toEqual([]);
  expect(errors).toEqual([]);
});

test('starting shows the REC mark, stopping hides it, and the sample is saved, listed and deletable', async ({
  page,
}) => {
  const errors = await boot(page);
  await expect(page.locator('#sampleMark')).toBeHidden();

  await openPlaySample(page);
  await choose(page, 'Record a sample', 'What is recorded');
  await choose(page, 'Next', 'What is not recorded');
  await choose(page, 'Next', 'Where it goes');
  await pressUntil(page, 'Enter', () => (window as unknown as { __lf: Lf }).__lf.sampling);
  expect(await lf(page, (g) => g.sampling)).toBe(true);
  await expect(page.locator('#sampleMark')).toBeVisible();
  // Starting leaves the screens, back to the menu it was opened from.
  expect(await lf(page, (g) => g.debugState.sub)).toBeNull();

  // The screen now offers Stop, and the list shows the one recording.
  await lf(page, (g) => g.debugShow('options'));
  await choose(page, 'Play sample', 'Play sample');
  expect(await labels(page)).toEqual(['Stop sample', 'Saved samples', 'Back']);
  await choose(page, 'Saved samples', 'Saved samples');
  await expect(page.locator('#overlay .menu button').first()).toContainText('Recording');

  // Back out, stop it, and it is a saved, ended sample.
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay h2')?.textContent === 'Play sample',
  );
  await choose(page, 'Stop sample', 'Play sample');
  await expect.poll(() => lf(page, (g) => g.sampling)).toBe(false);
  await expect(page.locator('#sampleMark')).toBeHidden();
  expect(await labels(page)).toEqual(['Record a sample', 'Saved samples', 'Back']);

  await choose(page, 'Saved samples', 'Saved samples');
  const rows = page.locator('#overlay .menu button');
  // The one sample, then Open a zip (a file can be picked here), then Back.
  expect(await labels(page)).toEqual([
    expect.stringMatching(/^[A-Z][a-z]{2} \d+, \d\d:\d\d$/),
    'Open a zip',
    'Back',
  ]);
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).not.toContainText('Recording');
  await choose(page, await rows.first().locator('.lbl').innerText(), 'Saved sample');
  await expect(page.locator('#overlay .text')).toContainText('It was stopped normally');

  // Move to Delete (Save zip is the first row), which asks twice: the first press only arms it.
  for (let i = 0; i < 4; i += 1) {
    const now = await page.locator('#overlay .menu button.sel .lbl').innerText();
    if (now === 'Delete') break;
    await pressUntil(
      page,
      'ArrowDown',
      (was) => document.querySelector('#overlay .menu button.sel .lbl')?.textContent !== was,
      now,
    );
  }
  await expect(page.locator('#overlay .menu button.sel .lbl')).toHaveText('Delete');
  await pressUntil(
    page,
    'Enter',
    () =>
      document
        .querySelector('#overlay .menu button.sel .val')
        ?.textContent?.includes('Tap again') === true,
  );
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Saved samples',
  );
  // With the sample gone, Open a zip and Back are what is left.
  await expect(page.locator('#overlay .menu button')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('Save zip downloads the log and the specs, and nothing leaves the page for any other address', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'))
      outside.push(url);
  });
  const errors = await boot(page);

  // Record a little, then stop.
  await lf(page, (g) => g.startSample());
  await expect.poll(() => lf(page, (g) => g.sampling)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await page.mouse.click(310, 210);
  await lf(page, (g) => g.stopSample());
  await expect.poll(() => lf(page, (g) => g.sampling)).toBe(false);

  // Open the saved sample and read what its screen says before saving.
  await openPlaySample(page);
  await choose(page, 'Saved samples', 'Saved samples');
  await choose(
    page,
    await page.locator('#overlay .menu button .lbl').first().innerText(),
    'Saved sample',
  );
  await expect(page.locator('#overlay .text')).toContainText('The zip holds');
  await expect(page.locator('#overlay .text')).toContainText('on Linux');
  expect(await labels(page)).toContain('Save zip');

  const started = page.waitForEvent('download');
  await settle(page);
  // Held for a few frames so the game sees it, and let go before it repeats.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.up('Enter');
  const download = await started;
  expect(download.suggestedFilename()).toMatch(/^fizz-session-[0-9a-f-]{8}\.zip$/);

  const files = readZip(readFileSync(await download.path()));
  expect(files.map((f) => f.name)).toEqual(['session.ndjson', 'specs.json']);
  const lines = new TextDecoder().decode(files[0]!.data).split('\n').filter(Boolean);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    v: 1,
    startedAt: expect.stringMatching(/^\d{4}-/),
  });
  const events = lines.slice(1).map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(events.some((e) => e['e'] === 'key' && e['k'] === 'ArrowDown')).toBe(true);
  expect(events.some((e) => e['e'] === 'ptr' && e['x'] === 310 && e['y'] === 210)).toBe(true);
  const specs = JSON.parse(new TextDecoder().decode(files[1]!.data)) as Record<string, unknown>;
  expect(specs).toMatchObject({ host: 'web', game: expect.any(String), size: expect.any(String) });
  // The specs carry nothing that names a person or a device.
  expect(JSON.stringify(specs)).not.toMatch(/Mozilla|userAgent|language|deviceId/i);

  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});
