// The opening titles' canvas: sized to the 1920 by 1080 space the timeline uses, with the font and the mark loaded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { LIMINAL_MARK_SVG } from './liminal-mark';
import { TITLES_H, TITLES_W } from './titles';
import { drawTitles } from './titles-draw';
import type { TitleSprite } from './titles-sprites';

/** Paints the titles on a canvas the page sizes with CSS (it keeps its shape and is letterboxed). */
export class TitlesView {
  private readonly g: CanvasRenderingContext2D | null;
  private mark: HTMLImageElement | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sprites: ReadonlyMap<string, TitleSprite>,
  ) {
    canvas.width = TITLES_W;
    canvas.height = TITLES_H;
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
    drawTitles(g, T, { sprites: this.sprites, mark: this.mark }, { calm });
    if (black > 0) {
      g.globalAlpha = black;
      g.fillStyle = '#000000';
      g.fillRect(0, 0, TITLES_W, TITLES_H);
      g.globalAlpha = 1;
    }
  }
}
