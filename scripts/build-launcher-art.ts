// Exports each episode's menu look for the launcher, which cannot import an episode's code: a theme file and the bullet's picture.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-launcher-art.ts [--check]
//   --check  fail if the committed files differ from what this would write (used by validate)
//
// For each episode it writes, under `apps/player/public/launcher/<episode>/`: `episode.json` (the page that runs it
// and where its saves are kept), `theme.json` (the colours, the plate's steps, the menu sounds and where the
// bullet is) and `bullet.png` (the bullet's frames side by side, one pixel per sprite pixel, which the launcher
// scales up without smoothing). They come from the grids, colours and effects the game itself uses.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SfxVoice } from '../packages/engine/src/audio';
import { EGA } from '../packages/engine/src/palette';
import { encodePngRgba } from '../packages/engine/src/png';
import type { Colour } from '../packages/engine/src/palette';
import { Pen, type Grid } from '../packages/engine/src/pen';
import {
  bulletFrames,
  BULLET_STEP_MS,
  type MenuThemeData,
} from '../packages/engine/src/menu/theme';
import { EPISODE_1_MENU, episodeMenuTheme } from '../episodes/episode-1/src/menu-theme';
import { SFX } from '../episodes/episode-1/src/audio/patterns';
import { SAVE_KEY, SLOT_COUNT, slotKey } from '../episodes/episode-1/src/save';
import { defineSprites } from '../episodes/episode-1/src/sprites/catalog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'apps/player/public/launcher');

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The frames side by side as a PNG, transparent where the grids are. */
export function stripPng(frames: readonly Grid[]): Uint8Array {
  const w = frames.reduce((sum, g) => sum + g.w, 0);
  const h = frames.reduce((max, g) => Math.max(max, g.h), 0);
  const rgba = new Uint8Array(w * h * 4);
  let at = 0;
  for (const grid of frames) {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.at(x, y);
        if (!c) continue;
        const [r, g, b] = hex(EGA[c]);
        const o = (y * w + at + x) * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = 255;
      }
    }
    at += grid.w;
  }
  return encodePngRgba(w, h, rgba);
}

/** The width of the demo strip, which tiles: what leaves on the right comes back on the left. */
export const STRIP_W = 640;
/** The height of the demo strip. */
export const STRIP_H = 144;

/** Copies a sprite onto the pen, top left corner at (x, y). Transparent pixels leave what is there. */
function blit(pen: Pen, grid: Grid, x: number, y: number): void {
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      const c = grid.at(i, j);
      if (c) pen.px(x + i, y + j, c);
    }
  }
}

/** A small fixed pseudo-random sequence, so the strip is the same every build. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Episode 1's demo strip: a dusk sky dithered from black to the horizon's red, stars, a moon, hills, Crater
 * Fields' ground with crystals standing on it, a floating ledge with pickups, and clouds. It is drawn from the
 * game's own sprites and tiles, 640 by 144 pixels, and tiles sideways.
 */
export function episode1Strip(sprites: ReadonlyMap<string, Grid>): Pen {
  const get = (name: string): Grid => {
    const g = sprites.get(name);
    if (!g) throw new Error(`The strip needs the sprite ${name}`);
    return g;
  };
  const pen = new Pen(STRIP_W, STRIP_H);
  // The sky, a dither between bands, black at the top to red at the horizon.
  const bands: Colour[] = ['k', 'B', 'M', 'r'];
  const horizon = 108;
  const bayer = [0, 2, 3, 1];
  for (let y = 0; y < horizon; y++) {
    const t = (y / horizon) * (bands.length - 1);
    const lo = Math.min(bands.length - 2, Math.floor(t));
    const frac = t - lo;
    for (let x = 0; x < STRIP_W; x++) {
      const threshold = ((bayer[(y & 1) * 2 + (x & 1)] ?? 0) + 0.5) / 4;
      pen.px(x, y, bands[lo + (frac > threshold ? 1 : 0)] ?? 'r');
    }
  }
  // Stars in the dark upper half.
  const rand = lcg(2026);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * STRIP_W);
    const y = Math.floor(rand() * 54);
    pen.px(x, y, rand() < 0.3 ? 'c' : 'W');
  }
  blit(pen, get('moon'), 500, 14);
  // Two rows of hills, the far ones fainter. Each is a sum of waves that fit the strip's width, so it tiles.
  const hill = (base: number, wave: [number, number, number][], colour: Colour): void => {
    for (let x = 0; x < STRIP_W; x++) {
      let h = base;
      for (const [cycles, size, phase] of wave)
        h += size * Math.sin((2 * Math.PI * cycles * x) / STRIP_W + phase);
      for (let y = Math.round(horizon - h); y < 112; y++) pen.px(x, y, colour);
    }
  };
  hill(
    22,
    [
      [2, 9, 0.4],
      [5, 4, 1.7],
    ],
    'B',
  );
  hill(
    12,
    [
      [3, 6, 2.1],
      [7, 3, 0.2],
    ],
    'b',
  );
  // The ground: a row of grass-topped tile, then the fill below it.
  const top = get('craterTop');
  const fill = get('craterFill');
  for (let x = 0; x < STRIP_W; x += 16) {
    blit(pen, top, x, 112);
    blit(pen, fill, x, 128);
  }
  // Crystals standing on the ground, and a ledge in the air with pickups on and over it.
  const crystals: [string, number][] = [
    ['crysC', 36],
    ['crysM', 118],
    ['crysC', 214],
    ['crysM', 330],
    ['crysC', 420],
    ['crysM', 552],
    ['crysC', 604],
  ];
  for (const [name, x] of crystals) blit(pen, get(name), x, 96);
  const ledge = get('craterPlat');
  for (const x of [248, 264, 280]) blit(pen, ledge, x, 76);
  blit(pen, get('cookie'), 256, 60);
  blit(pen, get('soda'), 272, 60);
  blit(pen, get('cheezie'), 464, 88);
  blit(pen, get('choc'), 160, 90);
  blit(pen, get('cloud'), 90, 34);
  blit(pen, get('cloud'), 380, 24);
  return pen;
}

/** Ben running (two frames) and in the air, side by side. */
export function runnerFrames(sprites: ReadonlyMap<string, Grid>): Grid[] {
  const names = ['ben_run1', 'ben_run2', 'ben_jump'];
  return names.map((n) => {
    const g = sprites.get(n);
    if (!g) throw new Error(`The runner needs the sprite ${n}`);
    return g;
  });
}

interface Built {
  /** Path under `OUT`. */
  path: string;
  bytes: Uint8Array;
}

/** Every file the launcher needs, for every episode that has a menu look. */
export function build(): Built[] {
  const all = new Map(defineSprites().map((d) => [d.name, d.grid]));
  const soda = all.get('soda');
  const theme = episodeMenuTheme(soda);
  const frames = bulletFrames(theme);
  // The voices of the effects the menu cues play, so the launcher can play them without the episode's code.
  const voices: Record<string, readonly SfxVoice[]> = {};
  for (const effect of new Set(Object.values(EPISODE_1_MENU.sounds))) {
    const found = SFX[effect];
    if (!found) throw new Error(`The menu cue effect ${effect} has no voices`);
    voices[effect] = found;
  }
  const data: MenuThemeData = {
    colours: EPISODE_1_MENU.colours,
    plate: EPISODE_1_MENU.plate,
    sounds: EPISODE_1_MENU.sounds,
    voices,
    ...(frames.length
      ? {
          bullet: {
            src: 'bullet.png',
            frames: frames.length,
            stepMs: theme.bulletStepMs ?? BULLET_STEP_MS,
          },
        }
      : {}),
  };
  // What the launcher cannot import: the page that runs the episode and where its saves are kept.
  const info = {
    page: 'episode-1/index.html',
    strip: { src: 'strip.png', width: STRIP_W, height: STRIP_H },
    runner: { src: 'ben.png', width: 16, height: 24, frames: 3 },
    saves: {
      auto: SAVE_KEY,
      slots: Array.from({ length: SLOT_COUNT }, (_, i) => slotKey((i + 1) as 1 | 2 | 3 | 4)),
    },
  };
  const out: Built[] = [
    {
      path: 'episode-1/episode.json',
      bytes: new TextEncoder().encode(`${JSON.stringify(info, null, 2)}\n`),
    },
    {
      path: 'episode-1/theme.json',
      bytes: new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`),
    },
  ];
  if (frames.length) out.push({ path: 'episode-1/bullet.png', bytes: stripPng(frames) });
  out.push(
    { path: 'episode-1/strip.png', bytes: stripPng([episode1Strip(all)]) },
    { path: 'episode-1/ben.png', bytes: stripPng(runnerFrames(all)) },
  );
  return out;
}

function main(): void {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const { path, bytes } of build()) {
    const file = join(OUT, path);
    const have = existsSync(file) ? readFileSync(file) : undefined;
    const same = have !== undefined && Buffer.compare(Buffer.from(bytes), have) === 0;
    if (check) {
      if (!same) {
        console.error(`stale: apps/player/public/launcher/${path}`);
        stale = true;
      }
    } else if (!same) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      console.log(`wrote apps/player/public/launcher/${path}`);
    }
  }
  if (stale) {
    console.error('Launcher art is out of date. Run: bun run build:launcher-art');
    process.exit(1);
  }
  if (check) console.log('Launcher art is up to date.');
}

if (import.meta.main) main();
