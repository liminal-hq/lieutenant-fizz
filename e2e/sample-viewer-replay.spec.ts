// Browser checks for the viewer's replay: a loaded sample is watched in the page, from its row or from a hot spot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseComments } from '../packages/engine/src/session/comments';
import { sessionZip } from '../packages/engine/src/session/export';
import { readZip } from '../packages/engine/src/zip-read';

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

test('Clear all closes the replay of the samples it clears', async ({ page }) => {
  const { errors } = await open(page);
  await load(page, 'fizz.zip', await fixtureZip());
  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  await expect(page.locator('#replay-section')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#replay-section')).toBeHidden();
  expect(await replay(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('Clear all while the first Watch is still loading leaves no replay behind', async ({
  page,
}) => {
  const { errors } = await open(page);
  await load(page, 'fizz.zip', await fixtureZip());
  // Both clicks in one task, so the sim and the sprites have not finished loading when the samples are cleared.
  await page.evaluate(() => {
    (document.querySelector('#sessions button') as HTMLButtonElement).click();
    (document.querySelector('#clear') as HTMLButtonElement).click();
  });
  await page.waitForTimeout(1500);
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

test('comments: added at the moment, with a place, edited, deleted, and `c` starts one', async ({
  page,
}) => {
  const { errors } = await open(page);
  await load(page, 'fizz.zip', await fixtureZip());
  await expect(page.locator('#comments')).toBeHidden();
  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  await expect(page.locator('#comments')).toBeVisible();
  await expect(page.locator('#comment-list')).toContainText('No comments yet.');

  // The c key holds the replay and puts the cursor in the box.
  await page.locator('body').press('c');
  await expect(page.locator('#comment-text')).toBeFocused();
  await expect.poll(async () => (await replay(page))!.playing).toBe(false);

  // A comment at a moment, by name.
  await scrubTo(page, 4300);
  await page.locator('#comment-author').fill('Scott');
  await page
    .locator('#comment-text')
    .fill('The pod’s puff is hard to see.\nIt blends with the wall.');
  await page.getByRole('button', { name: 'Add comment' }).click();
  const items = page.locator('#comment-list li');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Fudge Bog, try 1, 0:');
  await expect(items.first()).toContainText('It blends with the wall.');
  await expect(items.first()).toContainText('Scott');
  await expect(page.locator('#comment-text')).toHaveValue('');

  // A second one earlier in the attempt, with a place chosen by clicking the picture.
  await scrubTo(page, 4150);
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await expect(page.locator('#comment-place')).toContainText('Click the picture');
  await page.locator('#replay-stage').click({ position: { x: 300, y: 150 } });
  await expect(page.locator('#comment-place')).toContainText('Place: tile');
  await page.locator('#comment-text').fill('Starts too fast here.');
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(items).toHaveCount(2);
  // They are in tick order: the earlier one is first.
  await expect(items.first()).toContainText('Starts too fast here.');

  // Going to one holds the replay at its moment.
  await page.getByRole('button', { name: /^Go to comment 2/ }).click();
  await expect.poll(async () => (await replay(page))!.tick).toBe(4300);
  expect((await replay(page))!.playing).toBe(false);

  // Editing changes the words, and deleting removes one.
  await page.getByRole('button', { name: 'Edit comment 1' }).click();
  await expect(page.locator('#comment-text')).toHaveValue('Starts too fast here.');
  await page.locator('#comment-text').fill('Starts a little too fast.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(items.first()).toContainText('Starts a little too fast.');
  await expect(items.first()).toContainText('edited');
  await page.getByRole('button', { name: 'Delete comment 2' }).click();
  await expect(items).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('exports the run with its comments and notes, and a new page reads them back', async ({
  page,
  browser,
}) => {
  const { errors } = await open(page);
  const original = await fixtureZip();
  await load(page, 'fizz.zip', original);
  await page.getByRole('button', { name: 'Watch fizz.zip' }).click();
  // Pausing first keeps the scrub exact: a replay left playing runs on from where it was put.
  await page.getByRole('button', { name: 'Pause' }).click();
  await scrubTo(page, 4300);
  await page.locator('#comment-author').fill('Scott');
  await page.locator('#comment-text').fill('The pod’s puff is hard to see.');
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.locator('#comment-list li')).toHaveCount(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export with comments' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('fizz-fixture-fudge-bog-notes.zip');
  const exported = new Uint8Array(readFileSync((await download.path())!));
  const files = await readZip(exported);
  expect(files.map((f) => f.name).sort()).toEqual([
    'comments.json',
    'notes.md',
    'session.ndjson',
    'specs.json',
  ]);

  // The sample's own two files are exactly as they came.
  const came = await readZip(new Uint8Array(original));
  for (const name of ['session.ndjson', 'specs.json']) {
    expect(files.find((f) => f.name === name)!.data).toEqual(
      came.find((f) => f.name === name)!.data,
    );
  }

  // The comments are in the file, and the notes carry them with what was happening and the replay's verdicts.
  const decoder = new TextDecoder();
  const parsed = parseComments(
    decoder.decode(files.find((f) => f.name === 'comments.json')!.data),
  )!;
  expect(parsed.file.comments).toHaveLength(1);
  expect(parsed.file.comments[0]).toMatchObject({
    tick: 4300,
    author: 'Scott',
    attempt: 0,
    level: 7,
  });
  const notes = decoder.decode(files.find((f) => f.name === 'notes.md')!.data);
  expect(notes).toContain('# Play sample notes: fixture-fudge-bog');
  expect(notes).toContain('> The pod’s puff is hard to see.');
  expect(notes).toMatch(/\| (matches the recording|stops matching at [^|]+) \|/);
  await expect(page.locator('#comments-status')).toContainText(
    'fizz-fixture-fudge-bog-notes.zip with 1 comment',
  );

  // A new page (a fresh browser, with none of the first one's storage) opens the exported zip: the comment is there.
  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await page2.goto(VIEWER);
  await load(page2, 'notes.zip', Buffer.from(exported));
  await page2.getByRole('button', { name: 'Watch notes.zip' }).click();
  await expect(page2.locator('#comment-list li')).toHaveCount(1);
  await expect(page2.locator('#comment-list li').first()).toContainText(
    'The pod’s puff is hard to see.',
  );
  await expect(page2.locator('#comment-list li').first()).toContainText('Scott');
  await fresh.close();
  expect(errors).toEqual([]);
});
