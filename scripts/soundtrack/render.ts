// Renders the Episode 1 soundtrack to FLAC files laid out for an audio CD: 16-bit, 44.1 kHz, stereo.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/soundtrack/render.ts [--ring-out] <output folder> [track id ...]
//
// Each song plays in headless Chromium through the game's own Enhanced audio chain (stereo field, master chain and
// the room of the level it belongs to), silent to the speakers, and is tapped from the end of the chain in real time.
// A song plays whole as many times as it takes to pass `MIN_SECONDS`, then its next pass fades out over `FADE_SECONDS`.
// With `--ring-out` the song stops after its last whole pass instead, and the notes and reverb ring out for up to `RING_SECONDS`, with the silence after the tail cut.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from '../../episodes/episode-1/node_modules/vite/dist/node/index.js';
import { PATTERNS } from '../../episodes/episode-1/src/audio/patterns';

const SAMPLE_RATE = 44100;
const MIN_SECONDS = 50;
const FADE_SECONDS = 6;
const RING_SECONDS = 5;
/** A ring out ends where its tail falls below this level, and keeps this much quiet after it. */
const RING_FLOOR_DB = -80;
const RING_KEEP_SECONDS = 0.3;
/** The scheduler looks this far ahead of the audio clock, so a song stopped this long before its end keeps every note. */
const LOOKAHEAD_SECONDS = 0.3;
const WORKERS = 3;

const ALBUM = 'Lieutenant Fizz — Episode 1: The Cocoa Caper';

/** The tracks in disc order: the song's id, its title, and the room it is heard in. */
const TRACKS = [
  { id: 'openingTitles', title: 'Opening Titles', room: 'neutral' },
  { id: 'title', title: 'Lieutenant Fizz', room: 'neutral' },
  { id: 'map', title: 'Overworld', room: 'map' },
  { id: 'crater', title: 'Crater Fields', room: 'outdoor' },
  { id: 'caves', title: 'Crystal Caves', room: 'cave' },
  { id: 'citadel', title: "Mildred's Citadel", room: 'citadel' },
  { id: 'sky', title: 'Meteor Mesa', room: 'outdoor' },
  { id: 'tower', title: 'Zarg Lookout', room: 'tower' },
  { id: 'theatre', title: 'Bonbon Playhouse', room: 'theatre' },
  { id: 'foundry', title: 'Cocoa Foundry', room: 'foundry' },
  { id: 'secret', title: 'Gumdrop Isle', room: 'outdoor' },
  { id: 'boss', title: 'Cocoa Colossus', room: 'foundry' },
] as const;

const args = process.argv.slice(2);
const ringOut = args.includes('--ring-out');
const [outDir, ...only] = args.filter((a) => a !== '--ring-out');
if (!outDir)
  throw new Error('Usage: bun scripts/soundtrack/render.ts <output folder> [track id ...]');
mkdirSync(outDir, { recursive: true });

/** How long one pass of the song is, in seconds. */
const passSeconds = (id: string): number => {
  const song = PATTERNS.songs?.[id];
  if (!song) throw new Error(`No Enhanced song for ${id}`);
  return (song.cycles.reduce((a, b) => a + b, 0) * 240) / song.bpm;
};

const server = await createServer({
  root: join(import.meta.dir, '..', '..'),
  configFile: false,
  logLevel: 'error',
  server: { port: 0, host: '127.0.0.1' },
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('Vite gave no address');

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

async function render(index: number): Promise<void> {
  const track = TRACKS[index]!;
  const pass = passSeconds(track.id);
  const passes = Math.max(1, Math.ceil(MIN_SECONDS / pass));
  const length = pass * passes;
  const seconds = length + (ringOut ? RING_SECONDS : FADE_SECONDS);
  const raw = join(outDir, `.${track.id}.f32`);
  rmSync(raw, { force: true });
  const page = await browser.newPage();
  let first = -1;
  page.on('pageerror', (e) => console.error(track.id, e));
  await page.exposeFunction('sink', (l: string, r: string, frame: number) => {
    if (first < 0) first = frame;
    const left = new Float32Array(Buffer.from(l, 'base64').buffer.slice(0));
    const right = new Float32Array(Buffer.from(r, 'base64').buffer.slice(0));
    const out = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      out[i * 2] = left[i]!;
      out[i * 2 + 1] = right[i]!;
    }
    appendFileSync(raw, Buffer.from(out.buffer));
  });
  await page.goto(`${base}scripts/soundtrack/index.html`);
  const { startFrame } = await page.evaluate(
    ([id, room, secs, stop]) =>
      window.captureSong(id as string, room as never, secs as number, stop as number | undefined),
    [track.id, track.room, seconds, ringOut ? length - LOOKAHEAD_SECONDS : undefined] as const,
  );
  await page.close();
  const skip = (startFrame - first) / SAMPLE_RATE;
  const n = String(index + 1).padStart(2, '0');
  const file = join(outDir, `${n} - ${track.title.replace(/[\\/:*?"<>|]/g, '')}.flac`);
  // A fade for the looped ending; for a ring out, the silence after the tail is cut.
  const ending = ringOut
    ? `areverse,silenceremove=start_periods=1:start_threshold=${RING_FLOOR_DB}dB:start_silence=${RING_KEEP_SECONDS},areverse`
    : `afade=t=out:st=${length.toFixed(4)}:d=${FADE_SECONDS}`;
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'f32le',
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    '2',
    '-i',
    raw,
    '-af',
    `atrim=start=${skip.toFixed(4)}:duration=${seconds.toFixed(4)},asetpts=PTS-STARTPTS,${ending},aresample=${SAMPLE_RATE}:dither_method=triangular`,
    '-sample_fmt',
    's16',
    '-compression_level',
    '8',
    '-metadata',
    `title=${track.title}`,
    '-metadata',
    'artist=Liminal HQ',
    '-metadata',
    'composer=Scott Morris',
    '-metadata',
    `album=${ALBUM}`,
    '-metadata',
    `track=${index + 1}/${TRACKS.length}`,
    '-metadata',
    'date=2026',
    '-metadata',
    'copyright=© 2026 Liminal HQ, Scott Morris',
    file,
  ];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${track.id}`);
  rmSync(raw, { force: true });
  console.log(
    `${n} ${track.title}: ${passes} pass(es) of ${pass.toFixed(2)} s, ${seconds.toFixed(1)} s`,
  );
}

const todo = TRACKS.flatMap((t, i) => (only.length === 0 || only.includes(t.id) ? [i] : []));
const queue = [...todo];
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) await render(i);
  }),
);
await browser.close();
await server.close();
writeFileSync(join(outDir, '.done'), '');
rmSync(join(outDir, '.done'));
