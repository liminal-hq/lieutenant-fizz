// The opening titles' canvas: sized to the 1920 by 1080 space the timeline uses, with the font and the mark loaded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { LIMINAL_MARK_SVG } from './liminal-mark';
import { drawTitles } from './titles-draw';
import type { TitleSprite } from './titles-sprites';

/** The largest side of the canvas's pixels, so a very large screen does not make a canvas too big to paint every frame. */
const MAX_SIDE = 2560;

/** Paints the titles on a canvas the page sizes with CSS to fill the stage; its pixels follow its size. */
export class TitlesView {
  private readonly g: CanvasRenderingContext2D | null;
  private mark: HTMLImageElement | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sprites: ReadonlyMap<string, TitleSprite>,
  ) {
    this.g = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      this.mark = img;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LIMINAL_MARK_SVG)}`;
    // The cards are set in the pixel font, so have it ready before the first frame that needs it.
    void document.fonts?.load(`700 176px Fizz`);
    void document.fonts?.load(`66px Fizz`);
  }

  /**
   * Paints the titles at `T` seconds. `black` fades the picture out (0 to 1) for a skip, and `calm` leaves out the
   * white flash and the speed lines for a player who has asked for less motion.
   */
  draw(T: number, black: number, calm: boolean): void {
    const g = this.g;
    if (!g) return;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.min(1, MAX_SIDE / Math.max(c.clientWidth, c.clientHeight, 1) / dpr);
    const width = Math.max(2, Math.round(c.clientWidth * dpr * fit));
    const height = Math.max(2, Math.round(c.clientHeight * dpr * fit));
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
    drawTitles(g, T, { sprites: this.sprites, mark: this.mark }, { calm, width, height });
    if (black > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = black;
      g.fillStyle = '#000000';
      g.fillRect(0, 0, width, height);
      g.globalAlpha = 1;
    }
  }
}
