// Browser checks for watching a saved play sample: it runs on a sim of its own, has its controls, and changes nothing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { pressUntil, settle } from './keys';
import { fixtureZip } from './sample-fixture';

interface Replay {
  tick: number;
  playing: boolean;
  layers: string[];
  drift: string | null;
}

interface Lf {
  startSample(): Promise<boolean>;
  stopSample(): Promise<void>;
  sampling: boolean;
  debugShow(s: string): void;
  debugWatch(id?: string, paused?: boolean): Promise<boolean>;
  debugReplay: Replay | null;
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

/** How many sessions are stored and how many characters of events they hold, read from the page's IndexedDB. */
async function stored(page: Page): Promise<{ sessions: number; chars: number }> {
  return page.evaluate(
    () =>
      new Promise<{ sessions: number; chars: number }>((resolve, reject) => {
        const open = indexedDB.open('lf-samples', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['sessions', 'chunks']);
          const sessions = tx.objectStore('sessions').count();
          const chunks = tx.objectStore('chunks').getAll();
          tx.oncomplete = () =>
            resolve({
              sessions: sessions.result,
              chars: (chunks.result as string[]).join('').length,
            });
        };
      }),
  );
}

/** Records a short run in the first level: it walks right for a moment, then the sample is stopped. */
async function recordARun(page: Page): Promise<void> {
  expect(await lf(page, (g) => g.startSample())).toBe(true);
  await lf(page, (g) => g.debugShow('play'));
  await settle(page, 10);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowRight');
  await lf(page, (g) => g.stopSample());
}

const replayState = (page: Page): Promise<Replay | null> => lf(page, (g) => g.debugReplay);
const playing = (): boolean | undefined =>
  (window as unknown as { __lf: Lf }).__lf.debugReplay?.playing;

test('a recorded run is watched on a sim of its own, with its controls, and nothing is changed', async ({
  page,
}) => {
  const { requests, errors } = await boot(page);
  // Nothing of the replay is loaded until it is asked for.
  expect(requests.some((u) => u.includes('/replay/'))).toBe(false);

  await recordARun(page);
  const before = await stored(page);
  expect(before.sessions).toBe(1);

  // Held at the start, so the checks below do not race the end of a short run.
  expect(await lf(page, (g) => g.debugWatch(undefined, true))).toBe(true);
  expect(requests.some((u) => u.includes('/replay/game-host'))).toBe(true);
  await expect(page.locator('#replay')).toBeVisible();
  // The menus and the HUD step aside, and the game's own screen stays under it.
  await expect(page.locator('#stage')).toHaveAttribute('data-replay', 'on');
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#replay .replay-info')).toContainText('try 1 of 1');
  expect((await replayState(page))!.layers).toEqual(
    expect.arrayContaining(['path', 'deaths', 'input', 'sound']),
  );
  await expect(page.locator('#replay .replay-play')).toHaveText('► Play');
  const held = (await replayState(page))!.tick;
  await page.waitForTimeout(300);
  expect((await replayState(page))!.tick).toBe(held);

  // The scrub bar moves to a tick, forward and back, and the replay holds there.
  const min = Number(await page.locator('#replay .replay-scrub').getAttribute('min'));
  for (const offset of [90, 20]) {
    await page.locator('#replay .replay-scrub').evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = String(v);
      input.dispatchEvent(new Event('input'));
    }, min + offset);
    expect((await replayState(page))!.tick).toBe(min + offset);
  }

  // Playing runs on from there at the recorded ticks, and keeps matching the recording.
  await page.locator('#replay .replay-play').click();
  await expect(page.locator('#replay .replay-play')).toHaveText('‖ Pause');
  await expect
    .poll(async () => (await replayState(page))!.tick, { timeout: 15_000 })
    .toBeGreaterThan(min + 20 + 30);
  expect((await replayState(page))!.drift).toBeNull();
  // Pausing holds it where it is.
  await page.locator('#replay .replay-play').click();
  await expect(page.locator('#replay .replay-play')).toHaveText('► Play');
  expect((await replayState(page))!.playing).toBe(false);

  // A layer is switched on and off from the sheet.
  await page.getByRole('button', { name: 'Layers' }).click();
  const stays = page.getByRole('button', { name: 'Stays' });
  await expect(stays).toHaveAttribute('aria-pressed', 'false');
  await stays.click();
  await expect(stays).toHaveAttribute('aria-pressed', 'true');
  expect((await replayState(page))!.layers).toContain('stays');

  // The speed button cycles.
  await page.locator('#replay .replay-speed').click();
  await expect(page.locator('#replay .replay-speed')).toHaveText('2x');

  // The bar and the words fit the window.
  const { checked, ...problems } = await page.evaluate(audit, { roots: ['#replay'] });
  expect(checked).toBeGreaterThan(3);
  expect(problems.pageOverflow).toEqual([]);

  // Back takes it down and leaves the game as it was.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#replay')).toHaveCount(0);
  expect(await replayState(page)).toBeNull();
  await expect(page.locator('#stage')).not.toHaveAttribute('data-replay', 'on');

  // Watching wrote nothing: the same one session, with the same events, and no new sample started.
  expect(await stored(page)).toEqual(before);
  expect(await lf(page, (g) => g.sampling)).toBe(false);
  expect(errors).toEqual([]);
});

test('it starts playing by itself', async ({ page }) => {
  const { errors } = await boot(page);
  await recordARun(page);
  expect(await lf(page, (g) => g.debugWatch())).toBe(true);
  expect((await replayState(page))!.playing).toBe(true);
  const first = (await replayState(page))!.tick;
  await expect
    .poll(async () => (await replayState(page))!.tick, { timeout: 15_000 })
    .toBeGreaterThan(first + 20);
  expect((await replayState(page))!.drift).toBeNull();
  expect(errors).toEqual([]);
});

test('the keys play, pause and change the speed, and Esc takes the replay down', async ({
  page,
}) => {
  const { errors } = await boot(page);
  await recordARun(page);
  expect(await lf(page, (g) => g.debugWatch(undefined, true))).toBe(true);
  await settle(page, 5);

  // Z is Jump, which plays and pauses.
  await pressUntil(
    page,
    'KeyZ',
    () => !!(window as unknown as { __lf: Lf }).__lf.debugReplay?.playing,
  );
  await pressUntil(
    page,
    'KeyZ',
    () => !(window as unknown as { __lf: Lf }).__lf.debugReplay?.playing,
  );

  // Space is Fizz, which cycles the speed.
  await expect(page.locator('#replay .replay-speed')).toHaveText('1x');
  await pressUntil(
    page,
    'Space',
    () => document.querySelector('#replay .replay-speed')?.textContent !== '1x',
  );
  await expect(page.locator('#replay .replay-speed')).toHaveText('2x');

  // Enter plays and pauses too.
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(playing)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#replay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

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
  await expect(page.locator('#overlay h2')).toHaveText(to);
}

test('Watch is the first row on a sample with a level, opens the replay, and Back returns to the sample', async ({
  page,
}) => {
  const { errors } = await boot(page);
  await recordARun(page);
  await lf(page, (g) => g.debugShow('options'));
  await choose(page, 'Play sample', 'Play sample');
  await choose(page, 'Saved samples', 'Saved samples');
  // The one sample is the first row, then Back.
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Saved sample',
  );
  await expect(page.locator('#overlay h2')).toHaveText('Saved sample');
  await expect(page.locator('#overlay .menu button .lbl').first()).toHaveText('Watch');

  await pressUntil(page, 'Enter', () => !!(window as unknown as { __lf: Lf }).__lf.debugReplay);
  await expect(page.locator('#replay')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#replay')).toHaveCount(0);
  // The sample's own screen is where it was left.
  await expect(page.locator('#overlay h2')).toHaveText('Saved sample');
  expect(errors).toEqual([]);
});

/** How many samples are stored, 0 when the store has not been made. */
const storedCount = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('lf-samples', 1);
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('sessions')) return resolve(0);
          const count = db.transaction('sessions').objectStore('sessions').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );

test('Open a zip on Saved samples watches a file the player picks, and keeps nothing of it', async ({
  page,
}) => {
  const { errors } = await boot(page);
  await lf(page, (g) => g.debugShow('options'));
  await choose(page, 'Play sample', 'Play sample');
  await choose(page, 'Saved samples', 'Saved samples');
  await expect(page.locator('#overlay .menu button .lbl')).toHaveText(['Open a zip', 'Back']);

  // The picker opens from the Enter that chooses the row.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({
    name: 'someone-elses-sample.zip',
    mimeType: 'application/zip',
    buffer: await fixtureZip(),
  });
  await expect(page.locator('#replay')).toBeVisible();
  await expect(page.locator('#replay .replay-info')).toContainText('Fudge Bog, try 1 of 6');
  await expect.poll(async () => (await replayState(page))!.tick).toBeGreaterThan(0);
  expect((await replayState(page))!.drift).toBeNull();

  // It was read in the page: nothing was stored, and none was started.
  expect(await storedCount(page)).toBe(0);
  expect(await lf(page, (g) => g.sampling)).toBe(false);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#replay')).toHaveCount(0);
  await expect(page.locator('#overlay h2')).toHaveText('Saved samples');

  // A file that is not a sample says so, and the list is where it was.
  const [again] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);
  await again.setFiles({
    name: 'notes.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('this is not a zip'),
  });
  await expect(page.locator('#toast')).toContainText('That file is not a play sample');
  await expect(page.locator('#replay')).toHaveCount(0);
  await expect(page.locator('#overlay h2')).toHaveText('Saved samples');
  expect(errors).toEqual([]);
});
