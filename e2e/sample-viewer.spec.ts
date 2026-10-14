// Browser checks for the developer's play sample viewer: it reads zips, shows the numbers and the paths, and sends nothing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { sessionZip } from '../packages/engine/src/session/export';

const VIEWER = 'http://127.0.0.1:5199/';

/** A sample zip, as the game would save it, from event objects. */
async function sampleZip(id: string, events: object[]): Promise<Buffer> {
  const chunk = events.map((e, i) => JSON.stringify({ ms: i * 10, ...e })).join('\n') + '\n';
  const zip = await sessionZip({
    header: {
      v: 1,
      id,
      startedAt: '2026-10-13T14:02:00-04:00',
      specs: {
        host: 'web',
        browser: 'Chrome',
        browserVersion: '141',
        os: 'Linux',
        screen: [1920, 1080],
      },
    },
    chunks: [chunk],
  });
  return Buffer.from(zip);
}

const attempt = (id: number, name: string, n: number, from: number, end: object[]): object[] => [
  { t: from, e: 'level', id, name, attempt: n },
  ...Array.from({ length: 30 }, (_, i) => ({
    t: from + 4 * (i + 1),
    e: 'pos',
    x: 2 + i * 1.5,
    y: 3 + (i % 5),
  })),
  ...end,
];

async function open(page: Page): Promise<{ outside: string[]; errors: string[] }> {
  const outside: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(VIEWER) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
      outside.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(VIEWER);
  return { outside, errors };
}

test('loads zips and shows the levels, the buttons, the causes, the spots and the paths', async ({
  page,
}) => {
  const { outside, errors } = await open(page);
  await expect(page.locator('#results')).toBeHidden();

  const a = await sampleZip('aaaa1111', [
    ...attempt(0, 'Crater Fields', 1, 0, [
      { t: 130, e: 'death', cause: 3, detail: 5, x: 30.2, y: 2.4 },
      { t: 140, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
    ...attempt(0, 'Crater Fields', 2, 200, [
      { t: 900, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
    ]),
    { t: 905, e: 'in', b: 16 },
    { t: 906, e: 'in', b: 0 },
  ]);
  const b = await sampleZip('bbbb2222', [
    ...attempt(0, 'Crater Fields', 1, 0, [
      { t: 150, e: 'death', cause: 3, detail: 5, x: 30.7, y: 2.9 },
      { t: 160, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
  ]);
  await page.setInputFiles('#files', [
    { name: 'a.zip', mimeType: 'application/zip', buffer: a },
    { name: 'b.zip', mimeType: 'application/zip', buffer: b },
  ]);

  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#sessions li')).toHaveCount(2);
  const row = page.locator('#levels tr', { hasText: 'Crater Fields' });
  await expect(row).toContainText('3');
  await expect(row).toContainText('33%');
  await expect(page.locator('#causes')).toContainText('Chocolate');
  await expect(page.locator('#buttons .bar', { hasText: 'Jump' })).toContainText('1');
  await expect(page.locator('#spots li').first()).toContainText('Crater Fields, tile 30, 2: 2');
  await expect(page.locator('#legend')).toContainText('3 paths');

  // The canvas has something drawn on it.
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('map') as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n += 1;
    return n;
  });
  expect(drawn).toBeGreaterThan(500);

  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('says what is wrong with a file that is not a sample, and with one loaded twice', async ({
  page,
}) => {
  await open(page);
  const good = await sampleZip('cccc3333', attempt(1, 'Crystal Caves', 1, 0, []));
  await page.setInputFiles('#files', [
    {
      name: 'notes.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('this is not a zip file at all'),
    },
    { name: 'good.zip', mimeType: 'application/zip', buffer: good },
  ]);
  await expect(page.locator('#problems li')).toContainText(['This is not a zip file']);
  await expect(page.locator('#sessions li')).toHaveCount(1);

  await page.setInputFiles('#files', [
    { name: 'again.zip', mimeType: 'application/zip', buffer: good },
  ]);
  await expect(page.locator('#problems li')).toContainText('already loaded');
  await expect(page.locator('#sessions li')).toHaveCount(1);

  await page.locator('#clear').click();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#sessions li')).toHaveCount(0);
});

test('shows a name from a file as text, never as markup', async ({ page }) => {
  const { errors } = await open(page);
  const zip = await sampleZip('dddd4444', attempt(0, '<img src=x onerror=alert(1)>', 1, 0, []));
  await page.setInputFiles('#files', [{ name: 'x.zip', mimeType: 'application/zip', buffer: zip }]);
  await expect(page.locator('#levels')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#levels img')).toHaveCount(0);
  expect(errors).toEqual([]);
});
