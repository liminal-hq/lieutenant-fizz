// Pure maths for the view: whole-pixel scale (Sharp), the soft pixel ratio and the pixel budget.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Pixels in one world tile at scale 1. */
export const TILE_PX = 16;
/** The fewest tiles a Sharp view may show; below this the view falls back to Soft. */
export const MIN_TILES = 11;
/** The most pixels a canvas may hold (3840 × 2160); larger desktop canvases are scaled down. */
export const PIXEL_BUDGET = 3840 * 2160;

/** A whole-pixel view: each sprite pixel is `scale` canvas pixels and `tiles` tiles fit the height. */
export interface SharpView {
  scale: number;
  tiles: number;
}

/**
 * The whole scale and visible height for a canvas `heightPx` tall. The scale is the largest whole
 * number that keeps at least `target` tiles on screen, and the leftover height shows more of the
 * level (no bars). Returns null when the view would show fewer than `MIN_TILES`.
 */
export function sharpView(heightPx: number, target: number, minScale = 2): SharpView | null {
  if (!(heightPx > 0) || !(target > 0)) return null;
  const scale = Math.max(minScale, Math.floor(heightPx / (TILE_PX * target)));
  const tiles = heightPx / (TILE_PX * scale);
  if (tiles < MIN_TILES) return null;
  return { scale, tiles };
}

/** The Soft backing ratio: the device ratio, capped, and small enough to stay inside the budget. */
export function softRatio(
  dpr: number,
  cssW: number,
  cssH: number,
  cap = 2,
  budget = PIXEL_BUDGET,
): number {
  const area = Math.max(1, cssW * cssH);
  return Math.min(dpr, cap, Math.sqrt(budget / area));
}

/**
 * The whole divisor `k` that turns a device-pixel canvas into a backing that stays inside the
 * budget and the ratio cap, so the browser's pixelated upscale is a whole `k`×. Null when the
 * device size is not divisible by `k` (the caller uses Soft).
 */
export function sharpDivisor(
  devW: number,
  devH: number,
  dpr: number,
  cap = 3,
  budget = PIXEL_BUDGET,
): number | null {
  if (!(devW > 0) || !(devH > 0)) return null;
  let k = Math.max(1, Math.ceil(dpr / cap - 1e-6));
  while ((devW / k) * (devH / k) > budget) k += 1;
  if (devW % k !== 0 || devH % k !== 0) return null;
  return k;
}

/** The camera view for one frame; reused so the frame loop never allocates. */
export interface FrameView {
  halfW: number;
  halfH: number;
  /** The whole pixel scale in canvas pixels, or 0 when the view is Soft. */
  scale: number;
}

export interface FrameViewInput {
  cssW: number;
  cssH: number;
  /** The canvas backing size in pixels. */
  devW: number;
  devH: number;
  target: number;
  zoom: number;
  sharp: boolean;
}

/** Fills `out` with the half extents of the view: Sharp when it applies, today's formula otherwise. */
export function frameView(out: FrameView, i: FrameViewInput): FrameView {
  const sv = i.sharp && i.zoom === 1 ? sharpView(i.devH, i.target) : null;
  if (sv) {
    out.halfH = sv.tiles / 2;
    out.halfW = (out.halfH * i.devW) / i.devH;
    out.scale = sv.scale;
  } else {
    out.halfH = i.target / 2 / i.zoom;
    out.halfW = (out.halfH * i.cssW) / i.cssH;
    out.scale = 0;
  }
  return out;
}
