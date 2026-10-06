// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { EGA, hexToRgb, luminance } from './palette';
import type { Grid } from './pen';

/** A named sprite to pack. `tile` sprites clamp edge heights so normals are seamless. */
export interface SpriteDef {
  name: string;
  grid: Grid;
  tile: boolean;
}

/** UV rectangle in the atlas plus the sprite size in logical pixels. */
export interface AtlasRect {
  u: number;
  v: number;
  uw: number;
  vh: number;
  w: number;
  h: number;
}

export interface Atlas {
  /** Atlas edge length in texels. */
  size: number;
  /** RGBA8 albedo, bottom row first (GL orientation, no flipY needed). */
  albedo: Uint8Array;
  /** RGBA8 tangent-space normal map in the same layout. */
  normal: Uint8Array;
  rects: Record<string, AtlasRect>;
}

export interface AtlasOptions {
  /** Atlas edge in texels (default 2048). */
  size?: number;
  /** Texels per logical pixel (default 4). */
  scale?: number;
  /** Normal strength (default 2.2, Sobel-style on luminance height). */
  strength?: number;
}

/**
 * Packs sprites into one atlas (ENGINE_SPEC §3.2): each logical pixel becomes scale x scale
 * texels, every sprite gets a 1px extruded border, and a normal map with the same layout is
 * generated from palette luminance.
 */
export function buildAtlas(defs: readonly SpriteDef[], opts: AtlasOptions = {}): Atlas {
  const N = opts.size ?? 2048;
  const S = opts.scale ?? 4;
  const strength = opts.strength ?? 2.2;
  const alb = new Uint8Array(N * N * 4);
  const nrm = new Uint8Array(N * N * 4);
  const rects: Record<string, AtlasRect> = {};
  let cx = 0;
  let cy = 0;
  let rowH = 0;

  const put = (buf: Uint8Array, x: number, y: number, r: number, g: number, b: number): void => {
    const o = (y * N + x) * 4;
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
  };
  const copyPx = (buf: Uint8Array, sx: number, sy: number, dx: number, dy: number): void => {
    const s = (sy * N + sx) * 4;
    const d = (dy * N + dx) * 4;
    buf[d] = buf[s] ?? 0;
    buf[d + 1] = buf[s + 1] ?? 0;
    buf[d + 2] = buf[s + 2] ?? 0;
    buf[d + 3] = buf[s + 3] ?? 0;
  };

  for (const d of defs) {
    if (rects[d.name]) throw new Error(`duplicate sprite name "${d.name}"`);
    const { w, h, at } = {
      w: d.grid.w,
      h: d.grid.h,
      at: (x: number, y: number) => d.grid.at(x, y),
    };
    const pw = w * S;
    const ph = h * S;
    if (cx + pw + 2 > N) {
      cx = 0;
      cy += rowH;
      rowH = 0;
    }
    if (cy + ph + 2 > N) throw new Error(`atlas ${N}x${N} is full at sprite "${d.name}"`);
    const ox = cx + 1;
    const oy = cy + 1;
    const height = (x: number, y: number): number => {
      if (d.tile) {
        x = Math.max(0, Math.min(w - 1, x));
        y = Math.max(0, Math.min(h - 1, y));
      } else if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      const c = at(x, y);
      return c ? 0.35 + luminance(c) * 0.65 : 0;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = at(x, y);
        if (!c) continue;
        const [r, g, b] = hexToRgb(EGA[c]);
        let nx = (height(x - 1, y) - height(x + 1, y)) * strength;
        let ny = (height(x, y + 1) - height(x, y - 1)) * strength;
        let nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const nr = Math.round((nx * 0.5 + 0.5) * 255);
        const ng = Math.round((ny * 0.5 + 0.5) * 255);
        const nb = Math.round((nz * 0.5 + 0.5) * 255);
        for (let j = 0; j < S; j++) {
          for (let i = 0; i < S; i++) {
            put(alb, ox + x * S + i, oy + y * S + j, r, g, b);
            put(nrm, ox + x * S + i, oy + y * S + j, nr, ng, nb);
          }
        }
      }
    }
    // 1px extruded border (rows first, then full-height columns so corners are filled).
    for (const buf of [alb, nrm]) {
      for (let i = 0; i < pw; i++) {
        copyPx(buf, ox + i, oy, ox + i, oy - 1);
        copyPx(buf, ox + i, oy + ph - 1, ox + i, oy + ph);
      }
      for (let j = oy - 1; j < oy + ph + 1; j++) {
        copyPx(buf, ox, j, ox - 1, j);
        copyPx(buf, ox + pw - 1, j, ox + pw, j);
      }
    }
    // Image rows are top-first; GL wants v up, so v is measured from the bottom.
    rects[d.name] = { u: ox / N, v: 1 - (oy + ph) / N, uw: pw / N, vh: ph / N, w, h };
    cx += pw + 2;
    rowH = Math.max(rowH, ph + 2);
  }

  return { size: N, albedo: flipRows(alb, N), normal: flipRows(nrm, N), rects };
}

function flipRows(src: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(src.length);
  const stride = n * 4;
  for (let y = 0; y < n; y++)
    out.set(src.subarray(y * stride, (y + 1) * stride), (n - 1 - y) * stride);
  return out;
}
