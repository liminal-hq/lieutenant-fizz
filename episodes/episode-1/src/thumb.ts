// Draws the mini overworld shown on each save slot, from the sim's one-byte-per-tile map.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The overworld as the sim reports it: `kind | aux << 4` per tile, row 0 at the south. */
export interface ThumbData {
  w: number;
  h: number;
  cells: Uint8Array;
}

const GRASS = 0;
const RIVER = 1;
const NODE = 2;

/** Ground colour for each overworld area, by area id. */
const AREA_COLOURS: readonly number[] = [0x2e9d3f, 0xf29bc3, 0xa78bfa, 0xcfe6ff, 0x55d46a];
const RIVER_COLOUR = 0x6b3f1f;
const NODE_CLEARED = 0xffaa40;
const NODE_OPEN = 0xffffff;
const BEN = 0xf43f5e;

/**
 * The thumbnail as RGBA pixels, north at the top, one pixel per overworld tile. Level nodes light up
 * orange once cleared, and Ben shows as a 2x2 rose marker where the save was made.
 */
export function thumbPixels(
  t: ThumbData,
  doneMask: number,
  map?: { x: number; y: number },
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(t.w * t.h * 4);
  const put = (x: number, y: number, rgb: number): void => {
    if (x < 0 || y < 0 || x >= t.w || y >= t.h) return;
    const i = ((t.h - 1 - y) * t.w + x) * 4;
    out[i] = (rgb >> 16) & 255;
    out[i + 1] = (rgb >> 8) & 255;
    out[i + 2] = rgb & 255;
    out[i + 3] = 255;
  };
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const c = t.cells[y * t.w + x] ?? 0;
      const kind = c & 0x0f;
      const aux = c >> 4;
      if (kind === RIVER) put(x, y, RIVER_COLOUR);
      else if (kind === NODE) put(x, y, doneMask & (1 << aux) ? NODE_CLEARED : NODE_OPEN);
      else if (kind === GRASS) put(x, y, AREA_COLOURS[aux] ?? AREA_COLOURS[0] ?? 0);
    }
  }
  if (map) {
    const bx = Math.floor(map.x);
    const by = Math.floor(map.y);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      put(bx + dx, by + dy, BEN);
    }
  }
  return out;
}

/** The thumbnail as a PNG data URL, for an image the page scales up without smoothing. */
export function thumbDataUrl(
  t: ThumbData,
  doneMask: number,
  map?: { x: number; y: number },
): string {
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const g = c.getContext('2d');
  if (!g) return '';
  g.putImageData(new ImageData(thumbPixels(t, doneMask, map), t.w, t.h), 0, 0);
  return c.toDataURL();
}
