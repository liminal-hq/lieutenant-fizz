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
import type { MusicSong, MusicTrack, SfxVoice } from '../packages/engine/src/audio';
import type { HapticTable } from '../packages/engine/src/haptic-pattern';
import { EGA } from '../packages/engine/src/palette';
import { encodePngRgba } from '../packages/engine/src/png';
import { Pen, type Grid } from '../packages/engine/src/pen';
import {
  bulletFrames,
  BULLET_STEP_MS,
  type MenuThemeData,
} from '../packages/engine/src/menu/theme';
import { EPISODE_1_MENU, episodeMenuTheme } from '../episodes/episode-1/src/menu-theme';
import { MUSIC, SFX } from '../episodes/episode-1/src/audio/patterns';
import { buildSongs } from '../episodes/episode-1/src/audio/songs';
import { FIZZ_HAPTICS } from '../episodes/episode-1/src/haptics/fizz-haptics';
import { EPISODE_ID, EPISODE_KEYS, OPTIONS_KEY } from '../episodes/episode-1/src/options';
import { SAVE_KEY, SLOT_COUNT, slotKey } from '../episodes/episode-1/src/save';
import {
  GROUND_FROM_BOTTOM,
  SCENE_H,
  SCENE_W,
  episode1Scene,
  appScene,
  teaserScene,
  TREAT_SPRITES,
  type SceneArt,
} from './launcher-scenes';
import { Sim } from '../episodes/episode-1/src/sim/sim';
import { THUMB_PALETTE } from '../episodes/episode-1/src/thumb';
import { AREA_NAMES, LEVEL_TOTAL } from '../episodes/episode-1/src/slots';
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

/** The poses Ben takes on the title, side by side. */
export const TITLE_BEN_POSES = ['stand', 'jump', 'shoot', 'pogo', 'pogo2'] as const;

/** Ben's title poses, in the order of `TITLE_BEN_POSES`. */
export function titleBenFrames(sprites: ReadonlyMap<string, Grid>): Grid[] {
  return TITLE_BEN_POSES.map((pose) => {
    const g = sprites.get(`ben_${pose}`);
    if (!g) throw new Error(`The title needs the sprite ben_${pose}`);
    return g;
  });
}

/** The size of one cell of the actors sheet, and how many there are. */
const ACTOR_CELL = 16;

/**
 * What stands on the ground and flies through the scenery, one cell each side by side: the treats (in the order of
 * `TREAT_SPRITES`), two frames of a gloop, a gloop squashed flat, two frames of dazed stars and the fizz bubble. A
 * picture sits at the bottom of its cell, except the stars (the top, above a head) and the bubble (the middle).
 */
export function actorCells(sprites: ReadonlyMap<string, Grid>): Grid[] {
  const get = (name: string): Grid => {
    const g = sprites.get(name);
    if (!g) throw new Error(`The scenery actors need the sprite ${name}`);
    return g;
  };
  const place = (g: Grid, at: 'bottom' | 'top' | 'middle'): Grid => {
    const cell = new Pen(ACTOR_CELL, ACTOR_CELL);
    const dx = Math.floor((ACTOR_CELL - g.w) / 2);
    const dy =
      at === 'bottom' ? ACTOR_CELL - g.h : at === 'top' ? 0 : Math.floor((ACTOR_CELL - g.h) / 2);
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const c = g.at(x, y);
        if (c) cell.px(x + dx, y + dy, c);
      }
    return cell;
  };
  // A gloop flattened to half its height: every other row.
  const gloop = get('gloop0');
  const flat = new Pen(gloop.w, gloop.h);
  for (let y = 0; y < gloop.h / 2; y++)
    for (let x = 0; x < gloop.w; x++) {
      const c = gloop.at(x, y * 2);
      if (c) flat.px(x, y + gloop.h / 2, c);
    }
  return [
    ...TREAT_SPRITES.map((n) => place(get(n), 'bottom')),
    place(get('gloop0'), 'bottom'),
    place(get('gloop1'), 'bottom'),
    place(flat, 'bottom'),
    place(get('stars0'), 'top'),
    place(get('stars1'), 'top'),
    place(get('bubble'), 'middle'),
  ];
}

/** Ben running (two frames), in the air and shooting, side by side. */
export function runnerFrames(sprites: ReadonlyMap<string, Grid>): Grid[] {
  const names = ['ben_run1', 'ben_run2', 'ben_jump', 'ben_shoot'];
  return names.map((n) => {
    const g = sprites.get(n);
    if (!g) throw new Error(`The runner needs the sprite ${n}`);
    return g;
  });
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * The overworld the save slots draw their thumbnails from: one byte a tile, the area of each tile (for the place a
 * save was made in) and the colours. It comes from the built sim (`bun run build:wasm`); without one it is left
 * out, and the launcher then draws its slots without a thumbnail or a place.
 */
async function overworldData(): Promise<Uint8Array | undefined> {
  const wasm = join(root, 'episodes/episode-1/src/wasm/sim.wasm');
  if (!existsSync(wasm)) {
    console.warn(
      'No built sim (run `bun run build:wasm`): the overworld data is not written or checked.',
    );
    return undefined;
  }
  const sim = await Sim.load(readFileSync(wasm));
  const t = sim.overworldThumb();
  const areas = new Uint8Array(t.w * t.h);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) areas[y * t.w + x] = sim.areaOf(x + 0.5, y + 0.5);
  const data = {
    w: t.w,
    h: t.h,
    cells: toBase64(t.cells),
    areas: toBase64(areas),
    palette: THUMB_PALETTE,
  };
  return new TextEncoder().encode(`${JSON.stringify(data)}\n`);
}

/** What the launcher needs to lay a scene out: its size, the sky's top colour and each layer's picture and speed. */
function sceneInfo(scene: SceneArt, prefix: string): object {
  return {
    width: SCENE_W,
    height: SCENE_H,
    ground: GROUND_FROM_BOTTOM,
    skyTop: EGA[scene.skyTop],
    ben: scene.ben,
    ...(scene.demo
      ? { demo: { items: scene.demo, sheet: { src: 'actors.png', cell: ACTOR_CELL, cells: TREAT_SPRITES.length + 6 } } }
      : {}),
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
export async function build(): Promise<Built[]> {
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
  // What happens in the scenery makes a sound too: the game's own effects for a pickup, a stomp, a shot and a hit.
  const actions: Record<string, string> = {
    pickup: 'soda',
    stomp: 'bonk',
    shot: 'fzzt',
    hit: 'stun',
  };
  for (const effect of new Set(Object.values(actions))) {
    const found = SFX[effect];
    if (!found) throw new Error(`The scenery action effect ${effect} has no voices`);
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
    actions,
    haptics: { cues: EPISODE_1_MENU.haptics, table: hapticsTable },
    // The title theme is the episode's music in the launcher, as the Classic loop and the Enhanced song.
    music: {
      main: 'title',
      tracks: { title: MUSIC.title as MusicTrack },
      songs: { title: buildSongs(MUSIC).title as MusicSong },
    },
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
    runner: { src: 'ben.png', width: 16, height: 24, frames: 4 },
    // Ben on the title: one picture of each pose side by side, as the game's title shows him.
    titleBen: {
      src: 'ben-title.png',
      width: 16,
      height: titleBenFrames(all)[0]?.h ?? 24,
      poses: [...TITLE_BEN_POSES],
    },
    saves: {
      // What the Load game screen draws a slot from: the overworld (needs the built sim) and the names of its areas.
      overworld: 'overworld.json',
      levels: LEVEL_TOTAL,
      areas: [...AREA_NAMES],
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
    { path: 'episode-1/ben-title.png', bytes: stripPng(titleBenFrames(all)) },
    { path: 'episode-1/actors.png', bytes: stripPng(actorCells(all)) },
    ...sceneFiles('episode-1/', 'scene-', episode1),
  );
  // The app's icon, which App settings shows beside the logo: the 128 px copy the app is built with.
  out.push({
    path: 'app-icon.png',
    bytes: new Uint8Array(readFileSync(join(root, 'apps/player/src-tauri/icons/128x128.png'))),
  });
  const overworld = await overworldData();
  if (overworld) out.push({ path: 'episode-1/overworld.json', bytes: overworld });
  // The scenes that belong to the app, not to an episode: App settings by day, and an episode that is not out.
  for (const [name, scene] of [
    ['app', appScene(all)],
    ['teaser', teaserScene(all)],
  ] as const) {
    out.push(...sceneFiles(`scenes/${name}/`, '', scene), {
      path: `scenes/${name}/scene.json`,
      bytes: new TextEncoder().encode(`${JSON.stringify(sceneInfo(scene, ''), null, 2)}\n`),
    });
  }
  return out;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const { path, bytes } of await build()) {
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

if (import.meta.main) await main();
