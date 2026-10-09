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

/** How the canvas is drawn: Sharp and Soft as in slice 4, and Fast, one canvas pixel per sprite pixel. */
export type PixelMode = 'sharp' | 'soft' | 'fast';

/** The canvas backing store and how the browser maps it onto the screen. */
export interface Backing {
  /** The backing store size in pixels. */
  canvasW: number;
  canvasH: number;
  /** The whole factor the browser upscales the canvas by (1 when Soft). */
  k: number;
  /** True when the canvas maps onto device pixels by the whole factor `k`. */
  pixelGrid: boolean;
  /** True when the pixel budget made the canvas smaller than the ratio cap alone would have. */
  budgeted: boolean;
  /** The canvas's CSS size: the host's, unless the canvas overscans it. */
  cssW: number;
  cssH: number;
  /** Device pixels the canvas extends past the right and bottom of the screen (cropped; under `k`). */
  overscanW: number;
  overscanH: number;
  /** Device pixels in one sprite pixel under Fast (the whole scale Sharp would pick), else 0. */
  fastScale: number;
}

export interface BackingInput {
  /** The host's size in device pixels. */
  devW: number;
  devH: number;
  /** The host's size in CSS pixels. */
  cssW: number;
  cssH: number;
  dpr: number;
  mode: PixelMode;
  /** The tile target of the screen being drawn (it decides the whole scale Fast is built on). */
  target: number;
  budget?: number;
}

function softBacking(i: BackingInput, ratio: number): Backing {
  return {
    canvasW: Math.max(1, Math.floor(i.cssW * ratio)),
    canvasH: Math.max(1, Math.floor(i.cssH * ratio)),
    k: 1,
    pixelGrid: false,
    budgeted: false,
    cssW: i.cssW,
    cssH: i.cssH,
    overscanW: 0,
    overscanH: 0,
    fastScale: 0,
  };
}

/**
 * The canvas backing for a screen. Sharp backs the device size divided by `sharpDivisor` and Soft
 * backs `floor(css × softRatio)`, as in slice 4. Fast takes the whole scale `S` Sharp would draw at
 * and backs `ceil(device / S)` so a sprite pixel is one canvas pixel and the browser upscales by `S`.
 * The view is Sharp's, and when the screen does not divide by `S` the canvas overhangs the right and
 * bottom edges by under `S` device pixels, which the host crops. Where Sharp does not apply (under
 * 11 tiles) Fast is Soft at half the ratio.
 */
export function backing(i: BackingInput): Backing {
  const budget = i.budget ?? PIXEL_BUDGET;
  if (i.mode !== 'soft') {
    if (i.mode === 'fast') {
      const sv = sharpView(i.devH, i.target);
      if (sv && i.devW > 0) {
        const s = sv.scale;
        const canvasW = Math.ceil(i.devW / s);
        const canvasH = Math.ceil(i.devH / s);
        return {
          canvasW,
          canvasH,
          k: s,
          pixelGrid: true,
          budgeted: false,
          cssW: (canvasW * s) / i.dpr,
          cssH: (canvasH * s) / i.dpr,
          overscanW: canvasW * s - i.devW,
          overscanH: canvasH * s - i.devH,
          fastScale: s,
        };
      }
      return softBacking(i, softRatio(i.dpr, i.cssW, i.cssH, 2, budget) / 2);
    }
    const k = sharpDivisor(i.devW, i.devH, i.dpr, 3, budget);
    if (k !== null) {
      return {
        ...softBacking(i, 1),
        canvasW: i.devW / k,
        canvasH: i.devH / k,
        k,
        pixelGrid: true,
        budgeted: k > Math.max(1, Math.ceil(i.dpr / 3 - 1e-6)),
      };
    }
  }
  const ratio = softRatio(i.dpr, i.cssW, i.cssH, 2, budget);
  return { ...softBacking(i, ratio), budgeted: ratio < Math.min(i.dpr, 2) - 1e-9 };
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
  /** The fewest canvas pixels in a sprite pixel: 1 under Fast (the browser does the upscale), else 2. */
  minScale?: number;
}

/** Fills `out` with the half extents of the view: Sharp when it applies, today's formula otherwise. */
export function frameView(out: FrameView, i: FrameViewInput): FrameView {
  const sv = i.sharp && i.zoom === 1 ? sharpView(i.devH, i.target, i.minScale ?? 2) : null;
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
