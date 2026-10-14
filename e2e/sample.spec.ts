// Browser checks for the play sample: nothing of it loads while it is off, and a recorded session is read back from IndexedDB.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';

interface Lf {
  startSample(): Promise<boolean>;
  stopSample(): Promise<void>;
  sampling: boolean;
  debugShow(s: string): void;
}

const lf = <T>(page: Page, fn: (g: Lf) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__lf)`) as Promise<T>;

async function boot(page: Page): Promise<{ requests: string[]; errors: string[] }> {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return { requests, errors };
}

/** Every stored session and its events, read straight from the page's IndexedDB. */
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { header: Record<string, unknown>; ended: boolean; events: Record<string, unknown>[] }[]
      >((resolve, reject) => {
        const open = indexedDB.open('lf-samples', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['sessions', 'chunks']);
          const sessions = tx.objectStore('sessions').getAll();
          const chunks = tx.objectStore('chunks').getAll();
          tx.oncomplete = () => {
            const text = (chunks.result as string[]).join('');
            const events = text
              .split('\n')
              .filter(Boolean)
              .map((l) => JSON.parse(l));
            resolve(
              (sessions.result as { header: Record<string, unknown>; ended: boolean }[]).map(
                (s) => ({
                  header: s.header,
                  ended: s.ended,
                  events,
                }),
              ),
            );
          };
        };
      }),
  );
}

test('nothing of the play sample loads or is stored while it is off', async ({ page }) => {
  const { requests, errors } = await boot(page);
  await page.keyboard.press('Enter');
  expect(await lf(page, (g) => g.sampling)).toBe(false);
  expect(requests.filter((u) => u.includes('/sample/'))).toEqual([]);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).not.toContain('lf-samples');
  expect(errors).toEqual([]);
});

test('a recorded session holds the keys, the touches, the screens and the specs, and ends when stopped', async ({
  page,
}) => {
  const { errors } = await boot(page);
  expect(await lf(page, (g) => g.startSample())).toBe(true);
  expect(await lf(page, (g) => g.sampling)).toBe(true);

  await page.keyboard.press('ArrowDown');
  await page.mouse.click(300, 200);
  await lf(page, (g) => g.debugShow('options'));
  await page.keyboard.press('ArrowDown');
  await page.setViewportSize({ width: 800, height: 400 });
  // Entering a level outside a step still writes the level and what it was entered with, once each.
  await lf(page, (g) => g.debugShow('play'));
  await lf(page, (g) => g.stopSample());
  expect(await lf(page, (g) => g.sampling)).toBe(false);

  const sessions = await stored(page);
  expect(sessions).toHaveLength(1);
  const [session] = sessions;
  expect(session!.ended).toBe(true);
  expect(session!.header).toMatchObject({
    v: 1,
    // Revision 2, and a checksum of the sim the sample was made on.
    specs: {
      host: 'web',
      browser: expect.any(String),
      game: expect.any(String),
      rec: 2,
      sim: expect.stringMatching(/^[0-9a-f]{8}$/),
    },
  });
  expect(String(session!.header['startedAt'])).toMatch(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/,
  );

  const kinds = new Set(session!.events.map((e) => e['e']));
  for (const k of ['rs', 'screen', 'key', 'ptr', 'opt', 'sub', 'touch', 'level', 'enter'])
    expect(kinds, k).toContain(k);
  const levels = session!.events.filter((e) => e['e'] === 'level');
  const enters = session!.events.filter((e) => e['e'] === 'enter');
  expect(levels).toHaveLength(1);
  expect(enters).toHaveLength(1);
  expect(enters[0]).toMatchObject({
    id: levels[0]!['id'],
    lives: expect.any(Number),
    ammo: expect.any(Number),
    lvh: expect.any(Number),
  });
  // The layout is written with the window, the insets and the whole spec, so the controls can be placed again.
  expect(session!.events.find((e) => e['e'] === 'touch')).toMatchObject({
    w: expect.any(Number),
    h: expect.any(Number),
    insets: { top: expect.any(Number) },
    spec: { scale: expect.any(Number) },
  });
  const keys = session!.events.filter((e) => e['e'] === 'key');
  expect(keys.some((e) => e['k'] === 'ArrowDown' && e['down'] === true)).toBe(true);
  expect(keys.some((e) => e['k'] === 'ArrowDown' && e['down'] === false)).toBe(true);
  const clicks = session!.events.filter((e) => e['e'] === 'ptr' && e['k'] === 'down');
  expect(clicks[0]).toMatchObject({ x: 300, y: 200, ty: 'mouse' });
  // Every event carries a tick and the milliseconds since the start, and they only go forward.
  const ms = session!.events.map((e) => e['ms'] as number);
  expect(ms.every((m, i) => i === 0 || m >= ms[i - 1]!)).toBe(true);
  expect(errors).toEqual([]);
});

test('the log is not touched after the sample is stopped', async ({ page }) => {
  await boot(page);
  await lf(page, (g) => g.startSample());
  await page.keyboard.press('ArrowDown');
  await lf(page, (g) => g.stopSample());
  const before = (await stored(page))[0]!.events.length;
  await page.keyboard.press('ArrowUp');
  await page.mouse.click(100, 100);
  await page.waitForTimeout(2500);
  expect((await stored(page))[0]!.events.length).toBe(before);
});
