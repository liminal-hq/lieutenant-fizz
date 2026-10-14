// Draws sprite grids to a canvas, for the menu bullet and other small pictures shown as images.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { EGA } from '../palette';
import type { Grid } from '../pen';

/** Draws a grid at one canvas pixel per sprite pixel, starting `at` pixels from the left. */
export function paintGrid(canvas: HTMLCanvasElement, grid: Grid, at = 0): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.at(x, y);
      if (!c) continue;
      g.fillStyle = EGA[c];
      g.fillRect(at + x, y, 1, 1);
    }
  }
}

/** A picture as a data URL: one grid, or several side by side as a strip of frames. */
export function gridsToUrl(grids: readonly Grid[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = grids.reduce((w, g) => w + g.w, 0);
  canvas.height = grids.reduce((h, g) => Math.max(h, g.h), 0);
  let at = 0;
  for (const grid of grids) {
    paintGrid(canvas, grid, at);
    at += grid.w;
  }
  return canvas.toDataURL();
}
