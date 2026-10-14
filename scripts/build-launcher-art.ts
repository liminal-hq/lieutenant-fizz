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
import type { HapticTable } from '../packages/engine/src/haptic-pattern';
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
import { FIZZ_HAPTICS } from '../episodes/episode-1/src/haptics/fizz-haptics';
import { EPISODE_ID, EPISODE_KEYS, OPTIONS_KEY } from '../episodes/episode-1/src/options';
import { SAVE_KEY, SLOT_COUNT, slotKey } from '../episodes/episode-1/src/save';
import {
  GROUND_FROM_BOTTOM,
  SCENE_H,
  SCENE_W,
  episode1Scene,
  nightScene,
  teaserScene,
  type SceneArt,
} from './launcher-scenes';
import { TITLE_CARD } from '../episodes/episode-1/src/title-card';
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

/** Ben running (two frames) and in the air, side by side. */
export function runnerFrames(sprites: ReadonlyMap<string, Grid>): Grid[] {
  const names = ['ben_run1', 'ben_run2', 'ben_jump'];
  return names.map((n) => {
    const g = sprites.get(n);
    if (!g) throw new Error(`The runner needs the sprite ${n}`);
    return g;
  });
}

/** What the launcher needs to lay a scene out: its size, the sky's top colour and each layer's picture and speed. */
function sceneInfo(scene: SceneArt, prefix: string): object {
  return {
    width: SCENE_W,
    height: SCENE_H,
    ground: GROUND_FROM_BOTTOM,
    skyTop: EGA[scene.skyTop],
    ben: scene.ben,
    layers: scene.layers.map((l) => ({
      src: `${prefix}${l.name}.png`,
      speed: l.speed,
      ...(l.field ? { field: true } : {}),
    })),
  };
}

/** The picture of each layer of a scene, in `dir`, named `<prefix><layer>.png`. */
function sceneFiles(dir: string, prefix: string, scene: SceneArt): Built[] {
  return scene.layers.map((l) => ({
    path: `${dir}${prefix}${l.name}.png`,
    bytes: stripPng([l.pen]),
  }));
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
  // The haptic cues the menu uses, and only those: the launcher builds its own small table from them.
  const hapticsTable: HapticTable = { cues: {}, captions: {} };
  for (const id of new Set(Object.values(EPISODE_1_MENU.haptics))) {
    const found = FIZZ_HAPTICS.cues[id];
    if (!found) throw new Error(`The menu cue haptic ${id} is not in the haptic table`);
    hapticsTable.cues[id] = found;
  }
  const data: MenuThemeData = {
    colours: EPISODE_1_MENU.colours,
    plate: EPISODE_1_MENU.plate,
    sounds: EPISODE_1_MENU.sounds,
    voices,
    haptics: { cues: EPISODE_1_MENU.haptics, table: hapticsTable },
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
  const episode1 = episode1Scene(all);
  const info = {
    page: 'episode-1/index.html',
    // The words of the wordmark, drawn by the launcher with the same logo style as the game's title.
    card: {
      kicker: TITLE_CARD.kicker,
      words: [...TITLE_CARD.words],
      episode: TITLE_CARD.episode,
      name: TITLE_CARD.name,
    },
    // Where the episode's options are kept, so the launcher can carry an older save over and tell the episode's own
    // options from the app-wide ones.
    options: { episode: EPISODE_ID, legacyKey: OPTIONS_KEY, ownKeys: [...EPISODE_KEYS] },
    scene: sceneInfo(episode1, 'scene-'),
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
    { path: 'episode-1/ben.png', bytes: stripPng(runnerFrames(all)) },
    ...sceneFiles('episode-1/', 'scene-', episode1),
  );
  // The scenes that belong to the app, not to an episode: App settings by night, and an episode that is not out.
  for (const [name, scene] of [
    ['night', nightScene(all)],
    ['teaser', teaserScene(all)],
  ] as const) {
    out.push(...sceneFiles(`scenes/${name}/`, '', scene), {
      path: `scenes/${name}/scene.json`,
      bytes: new TextEncoder().encode(`${JSON.stringify(sceneInfo(scene, ''), null, 2)}\n`),
    });
  }
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
