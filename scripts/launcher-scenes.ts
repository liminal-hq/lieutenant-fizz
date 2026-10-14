// The launcher's scenery: scrolling layers of pixel art for each episode, for App settings and for an episode not out yet.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, type Grid } from '../packages/engine/src/pen';
import type { Colour } from '../packages/engine/src/palette';

/** The width of every layer, which tiles: what leaves on the right comes back on the left. */
export const SCENE_W = 640;
/** The height of every layer. */
export const SCENE_H = 192;
/** Where the ground starts, from the bottom of the scene, in scene pixels: Ben's feet stand there. */
export const GROUND_FROM_BOTTOM = 32;

/** One picture of a scene and how fast it scrolls compared with the ground (1 is the ground's speed, 0 stands still). */
export interface SceneLayer {
  name: string;
  pen: Pen;
  speed: number;
  /** The picture tiles up as well as sideways, filling the window above the horizon (the stars), faded out towards it. */
  field?: boolean;
}

export interface SceneArt {
  /** Back to front. The first is opaque; the others are transparent where nothing is drawn. */
  layers: SceneLayer[];
  /** The colour of the sky's top row, which the page continues up to the top of the window. */
  skyTop: Colour;
  /** Whether Ben runs along the ground. */
  ben: boolean;
}

const GROUND = SCENE_H - GROUND_FROM_BOTTOM;
const HORIZON = GROUND - 4;

/** Copies a sprite onto the pen, top left corner at (x, y), each of its pixels `k` pixels square. */
function blit(pen: Pen, grid: Grid, x: number, y: number, k = 1, colour?: Colour): void {
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      const c = grid.at(i, j);
      if (c) pen.rect(x + i * k, y + j * k, k, k, colour ?? c);
    }
  }
}

/** A small fixed pseudo-random sequence, so the art is the same every build. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sprite = (sprites: ReadonlyMap<string, Grid>, name: string): Grid => {
  const g = sprites.get(name);
  if (!g) throw new Error(`The scenes need the sprite ${name}`);
  return g;
};

/** The sky, a dither between bands from the top down, over the whole layer (the ground hides the bottom). */
function sky(bands: readonly Colour[]): Pen {
  const pen = new Pen(SCENE_W, SCENE_H);
  const bayer = [0, 2, 3, 1];
  for (let y = 0; y < SCENE_H; y++) {
    const t = (Math.min(y, HORIZON) / HORIZON) * (bands.length - 1);
    const lo = Math.min(bands.length - 2, Math.floor(t));
    const frac = t - lo;
    for (let x = 0; x < SCENE_W; x++) {
      const threshold = ((bayer[(y & 1) * 2 + (x & 1)] ?? 0) + 0.5) / 4;
      pen.px(x, y, bands[lo + (frac > threshold ? 1 : 0)] ?? bands[bands.length - 1] ?? 'k');
    }
  }
  return pen;
}

/** A tile of stars spread evenly over the whole picture, `count` of them, each one of these colours. */
function starField(rand: () => number, count: number, colours: readonly Colour[]): Pen {
  const pen = new Pen(SCENE_W, SCENE_H);
  for (let i = 0; i < count; i++) {
    const c = colours[Math.floor(rand() * colours.length)] ?? 'W';
    pen.px(Math.floor(rand() * SCENE_W), Math.floor(rand() * SCENE_H), c);
  }
  return pen;
}

/** A row of hills, a sum of waves that fit the width (so it tiles), filled down to the ground. */
function hills(base: number, wave: [number, number, number][], colour: Colour): Pen {
  const pen = new Pen(SCENE_W, SCENE_H);
  for (let x = 0; x < SCENE_W; x++) {
    let h = base;
    for (const [cycles, size, phase] of wave)
      h += size * Math.sin((2 * Math.PI * cycles * x) / SCENE_W + phase);
    for (let y = Math.round(HORIZON - h); y < GROUND; y++) pen.px(x, y, colour);
  }
  return pen;
}

/** Episode 1: a dusk sky from deep blue through magenta to the horizon's red, and Crater Fields below it. */
export function episode1Scene(sprites: ReadonlyMap<string, Grid>): SceneArt {
  const get = (name: string): Grid => sprite(sprites, name);
  const rand = lcg(2026);
  const stars = starField(rand, 70, ['W', 'W', 'c']);
  const bodies = new Pen(SCENE_W, SCENE_H);
  blit(bodies, get('planet'), 330, 30);
  blit(bodies, get('moon'), 520, 22);
  const clouds = new Pen(SCENE_W, SCENE_H);
  for (const [x, y] of [
    [70, 56],
    [226, 92],
    [400, 48],
    [566, 98],
  ] as const) {
    blit(clouds, get('cloud'), x, y);
  }
  const ground = new Pen(SCENE_W, SCENE_H);
  const top = get('craterTop');
  const fill = get('craterFill');
  for (let x = 0; x < SCENE_W; x += 16) {
    blit(ground, top, x, GROUND);
    blit(ground, fill, x, GROUND + 16);
  }
  const crystals: [string, number][] = [
    ['crysC', 36],
    ['crysM', 118],
    ['crysC', 214],
    ['crysM', 330],
    ['crysC', 420],
    ['crysM', 552],
    ['crysC', 604],
  ];
  for (const [name, x] of crystals) blit(ground, get(name), x, GROUND - 16);
  const ledge = get('craterPlat');
  for (const x of [248, 264, 280]) blit(ground, ledge, x, GROUND - 36);
  blit(ground, get('cookie'), 256, GROUND - 52);
  blit(ground, get('soda'), 272, GROUND - 52);
  blit(ground, get('cheezie'), 464, GROUND - 24);
  blit(ground, get('choc'), 160, GROUND - 22);
  return {
    skyTop: 'B',
    ben: true,
    layers: [
      { name: 'sky', pen: sky(['B', 'B', 'M', 'r']), speed: 0 },
      { name: 'stars', pen: stars, speed: 0.03, field: true },
      { name: 'bodies', pen: bodies, speed: 0.05 },
      { name: 'clouds', pen: clouds, speed: 0.12 },
      {
        name: 'hills-far',
        pen: hills(
          34,
          [
            [2, 12, 0.4],
            [5, 6, 1.7],
          ],
          'B',
        ),
        speed: 0.3,
      },
      {
        name: 'hills-near',
        pen: hills(
          18,
          [
            [3, 8, 2.1],
            [7, 4, 0.2],
          ],
          'b',
        ),
        speed: 0.55,
      },
      { name: 'ground', pen: ground, speed: 1 },
    ],
  };
}

/** Lays a checkerboard of black over what is drawn, which darkens it a step (the night's ground). */
function dim(pen: Pen): void {
  for (let y = 0; y < SCENE_H; y++)
    for (let x = 0; x < SCENE_W; x++) if (pen.at(x, y) && (x + y) % 2 === 0) pen.px(x, y, 'k');
}

/** App settings: the same land by night, a big moon, many stars, glowing crystals and no clouds. */
export function nightScene(sprites: ReadonlyMap<string, Grid>): SceneArt {
  const get = (name: string): Grid => sprite(sprites, name);
  const rand = lcg(1999);
  const stars = starField(rand, 150, ['W', 'W', 'L', 'c']);
  const bodies = new Pen(SCENE_W, SCENE_H);
  blit(bodies, get('moon'), 410, 24, 2);
  blit(bodies, get('planet'), 120, 46);
  const ground = new Pen(SCENE_W, SCENE_H);
  const top = get('craterTop');
  const fill = get('craterFill');
  for (let x = 0; x < SCENE_W; x += 16) {
    blit(ground, top, x, GROUND);
    blit(ground, fill, x, GROUND + 16);
  }
  dim(ground);
  for (const [name, x] of [
    ['crysC', 60],
    ['crysM', 190],
    ['crysC', 300],
    ['crysC', 470],
    ['crysM', 580],
  ] as const) {
    blit(ground, get(name), x, GROUND - 16);
  }
  return {
    skyTop: 'k',
    ben: true,
    layers: [
      { name: 'sky', pen: sky(['k', 'B']), speed: 0 },
      { name: 'stars', pen: stars, speed: 0.03, field: true },
      { name: 'bodies', pen: bodies, speed: 0.05 },
      {
        name: 'hills-far',
        pen: hills(
          30,
          [
            [2, 12, 1.1],
            [5, 5, 0.3],
          ],
          'k',
        ),
        speed: 0.3,
      },
      {
        name: 'hills-near',
        pen: hills(
          16,
          [
            [3, 8, 0.6],
            [7, 3, 2.4],
          ],
          'D',
        ),
        speed: 0.55,
      },
      { name: 'ground', pen: ground, speed: 1 },
    ],
  };
}

/** An episode that is not out: a dark skyline of spires in a drifting fog, a red glint in the dark and one lit window. */
export function teaserScene(sprites: ReadonlyMap<string, Grid>): SceneArt {
  const get = (name: string): Grid => sprite(sprites, name);
  const rand = lcg(7);
  const stars = starField(rand, 40, ['D']);
  const bodies = new Pen(SCENE_W, SCENE_H);
  blit(bodies, get('moon'), 470, 30, 3, 'D');
  // The skyline: black spires and towers of different heights standing on the horizon.
  const skyline = new Pen(SCENE_W, SCENE_H);
  const towers = ['owCastle', 'owTower', 'owLmSpire'];
  let x = 12;
  let n = 0;
  while (x < SCENE_W - 60) {
    const g = get(towers[n % towers.length] ?? 'owTower');
    const k = 2 + (n % 2);
    blit(skyline, g, x, HORIZON - g.h * k + 6, k, 'k');
    x += g.w * k + 24 + Math.floor(rand() * 40);
    n++;
  }
  // One window lit, high in the tallest of them.
  skyline.rect(138, HORIZON - 62, 3, 4, 'y');
  const fog = new Pen(SCENE_W, SCENE_H);
  for (const [row, density] of [
    [HORIZON - 30, 0.18],
    [HORIZON - 14, 0.28],
    [HORIZON + 2, 0.4],
  ] as const) {
    for (let y = row; y < row + 14 && y < GROUND; y++)
      for (let xx = 0; xx < SCENE_W; xx++)
        if (rand() < density * (1 - Math.abs(y - row - 7) / 8)) fog.px(xx, y, 'D');
  }
  const ground = hills(
    8,
    [
      [4, 4, 0.9],
      [9, 2, 0.1],
    ],
    'k',
  );
  for (let y = GROUND; y < SCENE_H; y++) for (let xx = 0; xx < SCENE_W; xx++) ground.px(xx, y, 'k');
  // Pairs of red glints low in the dark.
  for (const gx of [90, 260, 405, 560]) {
    ground.px(gx, GROUND + 6, 'r');
    ground.px(gx + 4, GROUND + 6, 'r');
  }
  return {
    skyTop: 'k',
    ben: false,
    layers: [
      { name: 'sky', pen: sky(['k', 'k', 'k', 'M']), speed: 0 },
      { name: 'stars', pen: stars, speed: 0.03, field: true },
      { name: 'bodies', pen: bodies, speed: 0.05 },
      { name: 'skyline', pen: skyline, speed: 0.25 },
      { name: 'fog', pen: fog, speed: 0.4 },
      { name: 'ground', pen: ground, speed: 1 },
    ],
  };
}
