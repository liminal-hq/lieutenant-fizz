// Turns the game's palette sprites into images the opening titles' canvas can draw.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SpriteDef } from '@lieutenant-fizz/engine/atlas';
import { EGA, hexToRgb } from '@lieutenant-fizz/engine/palette';
import type { Grid } from '@lieutenant-fizz/engine/pen';

/** Ben, firing backwards, both frames of each Zarg that chases him, and the game's own fizz bubble, stun stars and puff. */
export const TITLES_SPRITES: readonly string[] = [
  'ben_shoot',
  'bubble',
  'stars0',
  'stars1',
  'puff',
  ...['gloop', 'hopper', 'beetle', 'sentry', 'bat', 'drone', 'phantom'].flatMap((n) => [
    `${n}0`,
    `${n}1`,
  ]),
];

/** What the titles draw a sprite from: a canvas, and the same sprite as a flat black silhouette. */
export interface TitleSprite {
  image: CanvasImageSource;
  /** The sprite's pixels all black, for the drop shadow under Ben. */
  silhouette: CanvasImageSource;
  /** The sprite's pixels all white, for the flash of a hit. */
  white: CanvasImageSource;
  /** The sprite's size in its own pixels. */
  w: number;
  h: number;
}

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** The RGBA pixels of a grid, in its palette, or all in `tint` (a `#rrggbb` colour) when one is given. */
export function gridPixels(grid: Grid, tint?: string): Pixels {
  const data = new Uint8ClampedArray(grid.w * grid.h * 4);
  const flat = tint ? hexToRgb(tint) : null;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.at(x, y);
      if (!c) continue;
      const [r, g, b] = flat ?? hexToRgb(EGA[c]);
      const o = (y * grid.w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { width: grid.w, height: grid.h, data };
}

type Make = (w: number, h: number) => HTMLCanvasElement;

const makeCanvas: Make = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** A canvas holding the grid's pixels. */
export function spriteCanvas(
  grid: Grid,
  tint?: string,
  make: Make = makeCanvas,
): HTMLCanvasElement {
  const c = make(grid.w, grid.h);
  const px = gridPixels(grid, tint);
  const g = c.getContext('2d');
  if (g) {
    const image = g.createImageData(px.width, px.height);
    image.data.set(px.data);
    g.putImageData(image, 0, 0);
  }
  return c;
}

/** Every sprite the titles use, by name, picked out of the game's sprite definitions. */
export function titleSprites(
  defs: readonly SpriteDef[],
  make: Make = makeCanvas,
): Map<string, TitleSprite> {
  const byName = new Map(defs.map((d) => [d.name, d.grid] as const));
  const out = new Map<string, TitleSprite>();
  for (const name of TITLES_SPRITES) {
    const grid = byName.get(name);
    if (!grid) continue;
    out.set(name, {
      image: spriteCanvas(grid, undefined, make),
      silhouette: spriteCanvas(grid, '#000000', make),
      white: spriteCanvas(grid, '#ffffff', make),
      w: grid.w,
      h: grid.h,
    });
  }
  return out;
}
