// Draws the social card (the 1200×630 image apps show when the site's links are shared) as a PNG.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-social-card.ts [--check]
//   --check  fail if the committed PNG differs from what this would write (used by validate)
//
// The card is the BBS front screen drawn pixel by pixel: text from the Fizz glyph grids and the sprites
// from the game's own grids, scaled by whole numbers and written as a 16-colour indexed PNG with the
// EGA palette. Nothing here needs a browser or a font file, so the output is the same on every machine.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { FACES, faceEntries, type Entry } from '../packages/engine/src/font/build';
import { EGA, type Colour } from '../packages/engine/src/palette';
import { defineSprites } from '../episodes/episode-1/src/sprites/catalog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'site/assets/social-card.png');
const W = 1200;
const H = 630;

const CODES = Object.keys(EGA) as Colour[];
const px = new Uint8Array(W * H); // palette index per pixel, 0 = black
const idx = (c: Colour): number => CODES.indexOf(c);

function rect(x: number, y: number, w: number, h: number, c: Colour): void {
  const i = idx(c);
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) px[yy * W + xx] = i;
  }
}

const face = (file: string): Map<number, Entry> => {
  const spec = FACES.find((f) => f.file === file);
  if (!spec) throw new Error(`no face ${file}`);
  return new Map(faceEntries(spec).map((e) => [e.cp, e]));
};
const bold = face('fizz-bold');
const mono = face('fizz-mono-regular');

const glyph = (f: Map<number, Entry>, ch: string): Entry => {
  const e = f.get(ch.codePointAt(0) as number);
  if (!e) throw new Error(`Fizz has no glyph for ${JSON.stringify(ch)}`);
  return e;
};

/** The width of a text in pixels at scale `s`. */
function measure(f: Map<number, Entry>, t: string, s: number): number {
  let w = 0;
  for (const ch of t) w += glyph(f, ch).placed.adv * s;
  return w;
}

/** Draws text with the top of its cell at y and the left of its pen at x, `s` pixels per glyph pixel. */
function text(f: Map<number, Entry>, t: string, x: number, y: number, s: number, c: Colour): void {
  let pen = x;
  for (const ch of t) {
    const e = glyph(f, ch);
    e.placed.rows.forEach((row, ry) => {
      row.forEach((on, rx) => {
        if (on === 1) rect(pen + (e.placed.ox + rx) * s, y + ry * s, s, s, c);
      });
    });
    pen += e.placed.adv * s;
  }
}

const sprites = new Map(defineSprites().map((d) => [d.name, d.grid]));
function sprite(name: string, x: number, bottom: number, s: number): void {
  const g = sprites.get(name);
  if (!g) throw new Error(`no sprite ${name}`);
  for (let y = 0; y < g.h; y++) {
    for (let xx = 0; xx < g.w; xx++) {
      const c = g.at(xx, y);
      if (c) rect(x + xx * s, bottom - (g.h - y) * s, s, s, c);
    }
  }
}

function draw(): void {
  // Status bar, as on every page.
  rect(0, 0, W, 56, 'B');
  text(mono, 'FIZZ BBS \u00b7 NODE 1', 24, 6, 4, 'W');
  const right = 'SYSOP: LIMINAL HQ';
  text(mono, right, W - 24 - measure(mono, right, 4), 6, 4, 'W');
  // The EGA colour strip, sixteen cells.
  const cell = 66;
  rect(48, 84, cell * 16 + 8, 36, 'D');
  CODES.forEach((c, i) => rect(52 + i * cell, 88, cell, 28, c));
  // Greeting and title.
  text(mono, '*** WELCOME, CALLER ***', 52, 144, 4, 'm');
  const title = 'Lieutenant ';
  const fizz = 'Fizz';
  const s = 10;
  const tw = measure(bold, title + fizz, s);
  if (tw > W - 104) throw new Error(`title is ${tw}px wide`);
  text(bold, title, 52, 200, s, 'W');
  text(bold, fizz, 52 + measure(bold, title, s), 200, s, 'y');
  text(bold, 'Episode 1: The Cocoa Caper', 52, 330, 5, 'c');
  text(mono, 'Free to play in your browser', 52, 400, 4, 'L');
  // Prompt with a cursor.
  const ps = 'C:\\FIZZ>';
  text(mono, ps, 52, 520, 4, 'g');
  const cmd = ' play episode1';
  text(mono, cmd, 52 + measure(mono, ps, 4), 520, 4, 'W');
  rect(52 + measure(mono, ps + cmd, 4) + 8, 524, 24, 40, 'L');
  // Sprites, standing on a ground line along the bottom.
  rect(0, 594, W, 4, 'D');
  sprite('ben_stand', 660, 594, 6);
  sprite('saucer', 780, 594, 4);
  sprite('boss0', 940, 594, 5);
  // Frame: a double rule round the edge, below the status bar.
  rect(0, 56, W, 4, 'L');
  rect(0, H - 4, W, 4, 'L');
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(): Buffer {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed colour
  const plte = new Uint8Array(CODES.length * 3);
  CODES.forEach((c, i) => {
    const n = parseInt(EGA[c].slice(1), 16);
    plte.set([(n >> 16) & 255, (n >> 8) & 255, n & 255], i * 3);
  });
  const raw = new Uint8Array((W + 1) * H); // each row starts with filter type 0
  for (let y = 0; y < H; y++) raw.set(px.subarray(y * W, (y + 1) * W), y * (W + 1) + 1);
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}

draw();
const next = png();
const check = process.argv.includes('--check');
if (check) {
  if (!existsSync(OUT) || !readFileSync(OUT).equals(next)) {
    console.error('The social card is out of date. Run: bun run build:social');
    process.exit(1);
  }
  console.log('Social card is up to date.');
} else {
  writeFileSync(OUT, next);
  console.log(`Social card written (${next.length} bytes).`);
}
