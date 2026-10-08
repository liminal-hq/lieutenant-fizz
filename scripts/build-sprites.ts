// Exports the sprites the game guide shows as small SVG files, drawn from the same grids the game uses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-sprites.ts [--check]
//   --check  fail if the committed SVGs differ from what this would write (used by validate)
//
// Each file is one rect per horizontal run of a colour, with crisp edges, so it stays sharp at any size
// and the guide never carries a second copy of the art.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EGA } from '../packages/engine/src/palette';
import { defineSprites } from '../episodes/episode-1/src/sprites/catalog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'site/assets/sprites');

/** The sprite names the guide uses. */
export const GUIDE_SPRITES = [
  'ben_stand',
  'ben_pogo',
  'ben_shoot',
  'billy',
  'boss0',
  'saucer',
  'gloop0',
  'hopper0',
  'marsh0',
  'beetle0',
  'bat0',
  'pod1',
  'phantom0',
  'roller',
  'sentry0',
  'drone0',
  'cheezie',
  'choc',
  'cookie',
  'soda',
  'keyRed',
  'keyBlue',
  'keyGreen',
  'usb',
];

const defs = new Map(defineSprites().map((d) => [d.name, d.grid]));

function svg(name: string): string {
  const grid = defs.get(name);
  if (!grid) throw new Error(`no sprite ${name}`);
  const rects: string[] = [];
  for (let y = 0; y < grid.h; y++) {
    let x = 0;
    while (x < grid.w) {
      const c = grid.at(x, y);
      if (!c) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < grid.w && grid.at(end, y) === c) end++;
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${EGA[c]}"/>`);
      x = end;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.w} ${grid.h}" width="${grid.w}" height="${grid.h}" shape-rendering="crispEdges">\n` +
    `${rects.join('\n')}\n</svg>\n`
  );
}

const check = process.argv.includes('--check');
if (!check) mkdirSync(OUT, { recursive: true });
let stale = false;
for (const name of GUIDE_SPRITES) {
  const path = join(OUT, `${name}.svg`);
  const next = svg(name);
  if (existsSync(path) && readFileSync(path, 'utf8') === next) continue;
  if (check) stale = true;
  else writeFileSync(path, next);
}
if (check && stale) {
  console.error('The guide sprites are out of date. Run: bun run build:sprites');
  process.exit(1);
}
console.log(check ? 'Guide sprites are up to date.' : 'Guide sprites written.');
