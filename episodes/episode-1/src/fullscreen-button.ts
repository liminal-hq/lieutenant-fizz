// The fullscreen button: its two pixel glyphs and the small control that shows one of them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type {
  FullscreenButton as ButtonState,
  FullscreenGlyph,
} from '@lieutenant-fizz/engine/lifecycle-policy';
import type { Colour } from '@lieutenant-fizz/engine/palette';
import type { Grid } from '@lieutenant-fizz/engine/pen';

/** The side of a glyph, in sprite pixels. */
export const GLYPH_SIZE = 9;

/**
 * Expand is four corner brackets pointing outward; Collapse is four brackets pointing inward. `W` is a
 * lit pixel and `.` is clear, drawn in the game's white.
 */
export const GLYPHS: Record<FullscreenGlyph, readonly string[]> = {
  expand: [
    'WWW...WWW',
    'W.......W',
    'W.......W',
    '.........',
    '.........',
    '.........',
    'W.......W',
    'W.......W',
    'WWW...WWW',
  ],
  collapse: [
    '...W.W...',
    '...W.W...',
    '...W.W...',
    'WWWW.WWWW',
    '.........',
    'WWWW.WWWW',
    '...W.W...',
    '...W.W...',
    '...W.W...',
  ],
};

/** A glyph as a sprite grid, for the page to draw at a whole-number size. */
export function glyphGrid(glyph: FullscreenGlyph): Grid {
  const rows = GLYPHS[glyph];
  return {
    w: GLYPH_SIZE,
    h: GLYPH_SIZE,
    at: (x: number, y: number): Colour | null => (rows[y]?.[x] === 'W' ? 'W' : null),
  };
}

/** What the button needs from the page. */
export interface FullscreenButtonHooks {
  /** The player pressed the button. Called inside the click, so a fullscreen request still has its gesture. */
  press(): void;
  /** A glyph as an image URL. */
  glyphUrl(glyph: FullscreenGlyph): string;
}

/** Where the button sits on a touch screen: in the Pause pill's corner, or just left of the Pause pill. */
export type FullscreenPlace = 'corner' | 'beside-pause';

/**
 * The button that enters and leaves fullscreen: a glass pill with a pixel glyph, in the top-right corner.
 * It is a real button, so it has a name (`aria-label` and `title` follow the state) and can be activated
 * by a screen reader. It is not reachable by Tab, which the game keeps for itself.
 */
export class FullscreenControl {
  readonly el: HTMLButtonElement;
  private readonly img: HTMLImageElement;
  private glyph: FullscreenGlyph | null = null;

  constructor(private readonly hooks: FullscreenButtonHooks) {
    const el = document.createElement('button');
    el.id = 'fsBtn';
    el.type = 'button';
    el.className = 'lf';
    el.hidden = true;
    el.tabIndex = -1;
    const face = document.createElement('span');
    face.className = 'face';
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    face.append(this.img);
    el.append(face);
    el.addEventListener('click', () => {
      hooks.press();
      // A focused button would also take Space and Enter, which are Fizz and Select in the game.
      el.blur();
    });
    this.el = el;
  }

  /** Shows, hides and relabels the button. `place` matters on a touch screen only. */
  set(state: ButtonState, touch: boolean, place: FullscreenPlace): void {
    const el = this.el;
    el.hidden = !state.show;
    if (!state.show) return;
    if (this.glyph !== state.glyph) {
      this.glyph = state.glyph;
      this.img.src = this.hooks.glyphUrl(state.glyph);
    }
    el.setAttribute('aria-label', state.label);
    el.title = state.label;
    el.dataset.glyph = state.glyph;
    el.dataset.place = touch ? place : 'desktop';
  }

  /** Takes the button out of the page. */
  dispose(): void {
    this.el.remove();
  }
}
