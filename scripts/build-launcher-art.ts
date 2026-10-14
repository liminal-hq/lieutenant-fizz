// Exports each episode's menu look for the launcher, which cannot import an episode's code: a theme file and the bullet's picture.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-launcher-art.ts [--check]
//   --check  fail if the committed files differ from what this would write (used by validate)
//
// For each episode it writes `apps/player/public/launcher/<episode>/theme.json` (the colours, the plate's steps
// and where the bullet is) and `bullet.png` (the bullet's frames side by side, one pixel per sprite pixel, which
// the launcher scales up without smoothing). Both come from the grids and colours the game itself uses.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SfxVoice } from '../packages/engine/src/audio';
import { EGA } from '../packages/engine/src/palette';
import { encodePngRgba } from '../packages/engine/src/png';
import type { Grid } from '../packages/engine/src/pen';
import {
  bulletFrames,
  BULLET_STEP_MS,
  type MenuThemeData,
} from '../packages/engine/src/menu/theme';
import { EPISODE_1_MENU, episodeMenuTheme } from '../episodes/episode-1/src/menu-theme';
import { SFX } from '../episodes/episode-1/src/audio/patterns';
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

interface Built {
  /** Path under `OUT`. */
  path: string;
  bytes: Uint8Array;
}

/** Every file the launcher needs, for every episode that has a menu look. */
export function build(): Built[] {
  const soda = defineSprites().find((d) => d.name === 'soda')?.grid;
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
  const out: Built[] = [
    {
      path: 'episode-1/theme.json',
      bytes: new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`),
    },
  ];
  if (frames.length) out.push({ path: 'episode-1/bullet.png', bytes: stripPng(frames) });
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
