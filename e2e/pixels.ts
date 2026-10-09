// Helpers for measuring how big a sprite pixel is on the canvas, from strips read back from the GL buffer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, type Page } from '@playwright/test';

export interface View {
  sharp: boolean;
  scale: number;
  tiles: number;
  k: number;
  pixelGrid: boolean;
  budgeted: boolean;
  dpr: number;
  deviceW: number;
  deviceH: number;
  canvasW: number;
  canvasH: number;
  cssW: number;
  cssH: number;
  fast: boolean;
  deviceScale: number;
  overscanW: number;
  overscanH: number;
  cssCanvasW: number;
  cssCanvasH: number;
}

interface Lf {
  debugShow(s: string): void;
  debugView: View;
  debugPixels(
    rect: { x: number; y: number; w: number; h: number },
    opts?: { lighting?: boolean },
  ): number[];
}

/** Opens the URL, waits for the debug hook and shows Crater Fields. */
export async function openLevel(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!gl)
    throw new Error('This Chromium has no WebGL2. Try LF_CHROMIUM_ARGS="--use-angle=gl-egl".');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('play'));
  // The view is sized on the first frame in the level.
  await expect
    .poll(() => view(page).then((v) => v.tiles > 0 && v.canvasW > 1), { timeout: 15_000 })
    .toBe(true);
}

export const view = (page: Page): Promise<View> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugView);

/** One row of the canvas as RGBA, with sprite lighting off so flat colours stay flat. */
export const strip = (page: Page, y: number, w: number): Promise<number[]> =>
  page.evaluate(
    ([yy, ww]) =>
      (window as unknown as { __lf: Lf }).__lf.debugPixels(
        { x: 0, y: yy!, w: ww!, h: 1 },
        { lighting: false },
      ),
    [y, w],
  );

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Lengths and start positions of the runs of one colour in a strip, without the first and last run. */
export function runs(rgba: number[]): { start: number; len: number }[] {
  const out: { start: number; len: number }[] = [];
  const n = rgba.length / 4;
  let start = 0;
  const same = (a: number, b: number): boolean =>
    rgba[a * 4] === rgba[b * 4] &&
    rgba[a * 4 + 1] === rgba[b * 4 + 1] &&
    rgba[a * 4 + 2] === rgba[b * 4 + 2];
  for (let i = 1; i <= n; i++) {
    if (i === n || !same(i, start)) {
      out.push({ start, len: i - start });
      start = i;
    }
  }
  return out.slice(1, -1);
}

/**
 * Reads rows near the bottom of the canvas (ground fill) and returns the greatest common divisor of
 * the run lengths and whether the run edges of each row sit on one phase modulo that divisor. Each
 * row is a separate read, and the camera may move between reads, so phases are compared within a row.
 */
export async function measure(
  page: Page,
  v: View,
): Promise<{ divisor: number; congruent: boolean; runs: number }> {
  let g = 0;
  const perRow: number[][] = [];
  let count = 0;
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const y = v.canvasH - 1 - Math.round(((i + 0.5) * v.canvasH * 0.2) / rows);
    const r = runs(await strip(page, y, v.canvasW));
    for (const run of r) g = gcd(g, run.len);
    perRow.push(r.map((run) => run.start));
    count += r.length;
  }
  const congruent = g > 0 && perRow.every((edges) => edges.every((e) => e % g === edges[0]! % g));
  return { divisor: g, congruent, runs: count };
}

/** The canvas's backing size and where its box sits in the page. */
export const canvasBox = (
  page: Page,
): Promise<{ w: number; h: number; left: number; top: number; cw: number; ch: number }> =>
  page.evaluate(() => {
    const c = document.querySelector('#gl canvas') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, left: r.left, top: r.top, cw: r.width, ch: r.height };
  });

/**
 * The canvas covers the viewport: it starts at the top left corner and is at least as big as the
 * viewport, and larger by less than `maxOver` CSS pixels (the few device pixels a Fast canvas overhangs
 * the right and bottom edges by, which `#gl` crops). A Sharp or Soft canvas has `maxOver` 0 and fills it.
 */
export async function expectCovers(page: Page, maxOver = 0): Promise<void> {
  const vp = page.viewportSize()!;
  const b = await canvasBox(page);
  expect([b.left, b.top]).toEqual([0, 0]);
  expect(b.cw).toBeGreaterThanOrEqual(vp.width - 1e-6);
  expect(b.ch).toBeGreaterThanOrEqual(vp.height - 1e-6);
  expect(b.cw).toBeLessThanOrEqual(vp.width + maxOver + 1e-6);
  expect(b.ch).toBeLessThanOrEqual(vp.height + maxOver + 1e-6);
}

/** The whole host box the canvas is cropped to, `#gl`, has the viewport's size and hides overflow. */
export async function expectCropped(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const gl = await page.evaluate(() => {
    const e = document.getElementById('gl')!;
    const r = e.getBoundingClientRect();
    return { w: r.width, h: r.height, overflow: getComputedStyle(e).overflow };
  });
  expect([gl.w, gl.h, gl.overflow]).toEqual([vp.width, vp.height, 'hidden']);
}
