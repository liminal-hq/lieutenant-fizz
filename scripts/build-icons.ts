// Draws the web app icons (manifest, Home Screen and tab icons) from the 2g icon SVG.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-icons.ts [--check]
//   --check  fail if the committed icons differ from what this would write (used by validate)
//
// The source is assets/icon/fizz-icon.svg. The PNGs are drawn by the engine's own small rasteriser, which
// reads only the SVG shapes the icon uses and throws on anything else, so the output is the same on every
// machine and needs no browser or image library.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rasteriseIcon, type RasterOptions } from '../packages/engine/src/icon-raster';
import { encodePngRgba } from '../packages/engine/src/png';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets/icon/fizz-icon.svg');
const OUT = join(root, 'episodes/episode-1/public/icons');
const BG = '#0A0A0D';

// Android crops a maskable icon to a circle of 0.4 × its size; the art is scaled to sit well inside it.
const MASKABLE: RasterOptions = { background: BG, scale: 0.8 };

const svg = readFileSync(SRC, 'utf8');
const png = (px: number, opts?: RasterOptions): Uint8Array => {
  const r = rasteriseIcon(svg, px, opts);
  return encodePngRgba(r.width, r.height, r.data);
};

const outputs: [string, Uint8Array | string][] = [
  ['icon-192.png', png(192)],
  ['icon-512.png', png(512)],
  ['maskable-192.png', png(192, MASKABLE)],
  ['maskable-512.png', png(512, MASKABLE)],
  ['apple-touch-icon.png', png(180, { background: BG })],
  ['favicon-32.png', png(32)],
  ['icon.svg', svg],
];

const check = process.argv.includes('--check');
const stale: string[] = [];
for (const [name, data] of outputs) {
  const file = join(OUT, name);
  const bytes = Buffer.from(data);
  if (check) {
    if (!existsSync(file) || !readFileSync(file).equals(bytes)) stale.push(name);
  } else {
    writeFileSync(file, bytes);
    console.log(`${name} written (${bytes.length} bytes).`);
  }
}
if (check) {
  if (stale.length > 0) {
    console.error(`The icons are out of date (${stale.join(', ')}). Run: bun run build:icons`);
    process.exit(1);
  }
  console.log('Icons are up to date.');
}
