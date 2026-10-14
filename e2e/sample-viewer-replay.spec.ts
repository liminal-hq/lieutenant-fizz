// Browser checks for the viewer's replay: a loaded sample is watched in the page, from its row or from a hot spot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { sessionZip } from '../packages/engine/src/session/export';

const VIEWER = 'http://127.0.0.1:5199/';
const FIXTURE = new URL('../episodes/episode-1/src/replay/fixtures/fudge-bog/', import.meta.url);

interface ViewerReplay {
  tick: number;
  playing: boolean;
  layers: string[];
  drift: string | null;
}

/** The real phone recording of Fudge Bog, as the zip the game would save, with its events or specs changed. */
async function fixtureZip(
  edit: (events: Record<string, unknown>[], specs: Record<string, unknown>) => void = () => {},
): Promise<Buffer> {
  const lines = readFileSync(new URL('session.ndjson', FIXTURE), 'utf8').trim().split('\n');
  const header = JSON.parse(lines[0]!) as { id: string; startedAt: string };
  const events = lines.slice(1).map((l) => JSON.parse(l) as Record<string, unknown>);
  const specs = JSON.parse(readFileSync(new URL('specs.json', FIXTURE), 'utf8')) as Record<
    string,
    unknown
  >;
  edit(events, specs);
  const zip = await sessionZip({
    header: { v: 1, id: header.id, startedAt: header.startedAt, specs },
    chunks: [events.map((e) => JSON.stringify(e)).join('\n') + '\n'],
  });
  return Buffer.from(zip);
}

async function open(page: Page): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(VIEWER);
  return { errors };
}

async function load(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#files', { name, mimeType: 'application/zip', buffer });
  await expect(page.locator('#sessions li')).toHaveCount(1);
}

const replay = (page: Page): Promise<ViewerReplay | null> =>
  page.evaluate(() =>
    (window as unknown as { __viewer: { replay(): ViewerReplay | null } }).__viewer.replay(),
  );

/** Moves the replay's scrub bar to a tick, as a person dragging it would. */
async function scrubTo(page: Page, tick: number): Promise<void> {
  await page.locator('#replay .replay-scrub').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input'));
  }, tick);
}

test('a loaded sample is watched in the page, with the game’s layers and the hot spots', async ({
  page,
}) => {
  const { errors } = await open(page);
  await expect(page.locator('#replay-section')).toBeHidden();
  await load(page, 'fizz.zip', await fixtureZip());

  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  await expect(page.locator('#replay-section')).toBeVisible();
  await expect(page.locator('#replay')).toBeVisible();
  await expect(page.locator('#replay-gl canvas').first()).toBeVisible();
  await expect(page.locator('#replay .replay-info')).toContainText('Fudge Bog, try 1 of 6');

  // It plays at the recorded ticks and keeps matching the recording.
  const first = (await replay(page))!.tick;
  await expect
    .poll(async () => (await replay(page))!.tick, { timeout: 20_000 })
    .toBeGreaterThan(first + 40);
  expect((await replay(page))!.drift).toBeNull();

  // The sheet has the hot spots layer the viewer adds, off to start with; the others are the game's.
  await page.getByRole('button', { name: 'Layers' }).click();
  const hot = page.getByRole('button', { name: 'Hot spots' });
  await expect(hot).toHaveAttribute('aria-pressed', 'false');
  await hot.click();
  await expect(hot).toHaveAttribute('aria-pressed', 'true');
  expect((await replay(page))!.layers).toEqual(expect.arrayContaining(['path', 'hot']));

  // Back takes the replay down.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#replay-section')).toBeHidden();
  expect(await replay(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('a worst spot has a Watch that goes to a moment before that death', async ({ page }) => {
  const { errors } = await open(page);
  await load(page, 'fizz.zip', await fixtureZip());
  const row = page.locator('#spots li').first();
  await expect(row).toContainText('Fudge Bog');
  await row.getByRole('button', { name: /^Watch a death at/ }).click();
  await expect(page.locator('#replay')).toBeVisible();
  // The deaths in the recording are at ticks 4371 and later: it is well into the recording, not at the start.
  const at = (await replay(page))!.tick;
  expect(at).toBeGreaterThan(4200);
  expect((await replay(page))!.drift).toBeNull();
  expect(errors).toEqual([]);
});

test('says where a replay stops matching the recording, and when it was recorded on another build', async ({
  page,
}) => {
  const { errors } = await open(page);
  // One recorded position of the first attempt is moved a tile, and the specs name a build this is not.
  const zip = await fixtureZip((events, specs) => {
    const pos = events.find((e) => e['e'] === 'pos' && (e['t'] as number) > 4200)!;
    pos['x'] = (pos['x'] as number) + 1;
    specs['sim'] = 'deadbeef';
  });
  await load(page, 'fizz.zip', zip);
  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  await expect(page.locator('#replay')).toBeVisible();
  await expect(page.locator('#replay .replay-banner')).toContainText('different build');

  // Past the moved position, the replay says it no longer matches.
  await scrubTo(page, 4300);
  await expect(page.locator('#replay .replay-banner')).toContainText(
    'no longer matches the recording',
  );
  await expect(page.locator('#replay .replay-banner')).toContainText('different build');
  expect((await replay(page))!.drift).toMatch(/^pos@/);
  expect(errors).toEqual([]);
});

test('says when the level has been edited since a sample was recorded', async ({ page }) => {
  const { errors } = await open(page);
  // The first attempt gets the state it was entered with, written down as a newer game would, with a
  // fingerprint of the level that is not Fudge Bog's.
  const zip = await fixtureZip((events) => {
    const at = events.findIndex((e) => e['e'] === 'level');
    events.splice(at + 1, 0, {
      t: events[at]!['t'],
      ms: events[at]!['ms'],
      e: 'enter',
      id: 7,
      lives: 1,
      ammo: 14,
      score: 501,
      next: 600,
      done: 0,
      pogoH: 6.6,
      held: 18,
      lvh: 12345,
    });
  });
  await load(page, 'fizz.zip', zip);
  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  await expect(page.locator('#replay .replay-banner')).toContainText(
    'Fudge Bog has been edited since this was recorded',
  );
  expect(errors).toEqual([]);
});
