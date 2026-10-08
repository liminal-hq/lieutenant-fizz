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

/**
 * Characters that animate, as the game frames they cycle through and how long each shows. The file keeps
 * the first frame's name, so the pages need no change. The loop is CSS inside the SVG, which an `<img>`
 * runs, and it stops under `prefers-reduced-motion`, leaving the first frame.
 */
export const ANIMATIONS: Record<string, { frames: string[]; ms: number }> = {
  ben_stand: { frames: ['ben_run1', 'ben_run2'], ms: 160 },
  gloop0: { frames: ['gloop0', 'gloop1'], ms: 400 },
  hopper0: { frames: ['hopper0', 'hopper1'], ms: 500 },
  marsh0: { frames: ['marsh0', 'marsh1'], ms: 400 },
  beetle0: { frames: ['beetle0', 'beetle1'], ms: 250 },
  bat0: { frames: ['bat0', 'bat1'], ms: 200 },
  pod1: { frames: ['pod0', 'pod1'], ms: 600 },
  phantom0: { frames: ['phantom0', 'phantom1'], ms: 400 },
  sentry0: { frames: ['sentry0', 'sentry1'], ms: 350 },
  drone0: { frames: ['drone0', 'drone1'], ms: 120 },
  boss0: { frames: ['boss0', 'boss1'], ms: 500 },
};

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

type Grid = NonNullable<ReturnType<typeof defs.get>>;

function rectsOf(grid: Grid): string[] {
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
  return rects;
}

function svg(name: string): string {
  const grid = defs.get(name);
  if (!grid) throw new Error(`no sprite ${name}`);
  const anim = ANIMATIONS[name];
  if (anim) return animated(name, grid, anim);
  const rects = rectsOf(grid);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.w} ${grid.h}" width="${grid.w}" height="${grid.h}" shape-rendering="crispEdges">\n` +
    `${rects.join('\n')}\n</svg>\n`
  );
}

function animated(name: string, size: Grid, anim: { frames: string[]; ms: number }): string {
  const n = anim.frames.length;
  const total = n * anim.ms;
  const groups = anim.frames.map((f, i) => {
    const g = defs.get(f);
    if (!g) throw new Error(`no sprite ${f}`);
    if (g.w !== size.w || g.h !== size.h) throw new Error(`${f} is not the size of ${name}`);
    return `<g class="f f${i}">\n${rectsOf(g).join('\n')}\n</g>`;
  });
  // Each frame is hidden except for its own slice of the loop; `steps(1, end)` makes the switch instant.
  const css =
    `.f{visibility:hidden;animation:s ${total}ms steps(1,end) infinite}` +
    anim.frames.map((_, i) => `.f${i}{animation-delay:${i * anim.ms}ms}`).join('') +
    `@keyframes s{0%{visibility:visible}${(100 / n).toFixed(3)}%{visibility:hidden}}` +
    `@media (prefers-reduced-motion:reduce){.f{animation:none}.f0{visibility:visible}}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" width="${size.w}" height="${size.h}" shape-rendering="crispEdges">\n` +
    `<style>${css}</style>\n${groups.join('\n')}\n</svg>\n`
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
