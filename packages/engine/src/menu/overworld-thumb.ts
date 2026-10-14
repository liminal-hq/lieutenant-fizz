// Draws the mini overworld shown on each save slot, from an episode's one-byte-per-tile map and its colours.
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

/** The colours of a thumbnail, as 0xrrggbb: the ground of each area (by area id), the river, the nodes and Ben's marker. */
export interface ThumbPalette {
  areas: readonly number[];
  river: number;
  nodeCleared: number;
  nodeOpen: number;
  ben: number;
}

/**
 * The thumbnail as RGBA pixels, north at the top, one pixel per overworld tile. Level nodes light up
 * orange once cleared, and Ben shows as a 2x2 rose marker where the save was made.
 */
export function thumbPixels(
  t: ThumbData,
  doneMask: number,
  map: { x: number; y: number } | undefined,
  palette: ThumbPalette,
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
      if (kind === RIVER) put(x, y, palette.river);
      else if (kind === NODE)
        put(x, y, doneMask & (1 << aux) ? palette.nodeCleared : palette.nodeOpen);
      else if (kind === GRASS) put(x, y, palette.areas[aux] ?? palette.areas[0] ?? 0);
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
      put(bx + dx, by + dy, palette.ben);
    }
  }
  return out;
}

/** The thumbnail as a PNG data URL, for an image the page scales up without smoothing. */
export function thumbDataUrl(
  t: ThumbData,
  doneMask: number,
  map: { x: number; y: number } | undefined,
  palette: ThumbPalette,
): string {
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const g = c.getContext('2d');
  if (!g) return '';
  g.putImageData(new ImageData(thumbPixels(t, doneMask, map, palette), t.w, t.h), 0, 0);
  return c.toDataURL();
}
