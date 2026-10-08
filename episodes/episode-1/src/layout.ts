// Chooses the whole-number pixel scales for the overlay from the window size.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  MAX_SCALE,
  MIN_SCALE,
  pixelScale,
  scaleSteps,
  sidePadding,
  verticalPadding,
  wordmarkScale,
  wrapColumns,
} from '@lieutenant-fizz/engine/font/scale';

/** The room the touch controls take on each side of the menus, in CSS pixels (0 without them). */
export interface TouchGutters {
  left: number;
  right: number;
}

export const NO_GUTTERS: TouchGutters = { left: 0, right: 0 };

/**
 * The CSS custom properties that size the overlay, for a window of this size. With touch gutters the
 * menus start right of the D-pad and end left of the buttons, so the wordmark and text columns are
 * sized for the width left between them, and the wordmark stays on one line (two would not fit the
 * height of a landscape phone).
 */
export function layoutVars(
  width: number,
  height: number,
  large: boolean,
  gutters: TouchGutters = NO_GUTTERS,
): Record<string, string> {
  const steps = scaleSteps(pixelScale(height, large));
  const padX = sidePadding(width);
  const touch = gutters.left > 0 || gutters.right > 0;
  const content = width - Math.max(padX, gutters.left) - Math.max(padX, gutters.right);
  const logo = touch
    ? Math.min(Math.max(MIN_SCALE, Math.floor(content / 102)), steps.item + 3, MAX_SCALE)
    : wordmarkScale(width, padX, steps.item);
  return {
    '--lf-n': String(steps.item),
    '--lf-n-small': String(steps.small),
    '--lf-n-head': String(steps.head),
    '--lf-n-hint': String(steps.hint),
    '--lf-n-logo': String(logo),
    '--lf-cw-mul': String(steps.bullet),
    '--lf-pad-x': `${padX}px`,
    '--lf-pad-y': `${verticalPadding(height)}px`,
    '--lf-keys-bottom': `${Math.min(36, Math.max(16, Math.round(height * 0.04)))}px`,
    '--lf-thumb': String(steps.item >= 4 ? 2 : 1),
    '--lf-cols': String(wrapColumns(content, steps.small)),
    '--lf-touch-left': `${gutters.left}px`,
    '--lf-touch-right': `${gutters.right}px`,
  };
}

/** Writes the layout variables onto an element (the document root, so floating captions see them). */
export function applyLayout(
  el: HTMLElement,
  width: number,
  height: number,
  large: boolean,
  gutters: TouchGutters = NO_GUTTERS,
): void {
  for (const [name, value] of Object.entries(layoutVars(width, height, large, gutters))) {
    el.style.setProperty(name, value);
  }
}

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Calls `onChange` whenever the window is resized, the phone is turned (`orientationchange`) or the
 * visual viewport changes (a browser bar showing or hiding, a keyboard opening). Returns a function
 * that stops listening, so a disposed game does not stay reachable through the window.
 */
export function watchResize(
  onChange: () => void,
  target: Listenable = window,
  visual: Listenable | null = typeof window === 'undefined' ? null : window.visualViewport,
): () => void {
  target.addEventListener('resize', onChange);
  target.addEventListener('orientationchange', onChange);
  visual?.addEventListener('resize', onChange);
  return () => {
    target.removeEventListener('resize', onChange);
    target.removeEventListener('orientationchange', onChange);
    visual?.removeEventListener('resize', onChange);
  };
}

/** The touch target a menu row aims for: Android's 48 dp. */
export const TOUCH_ROW = 48;

/**
 * The height of each of `rows` menu rows on touch: 48 px when the screen has room, else shorter by an
 * equal share of `overflow` (how far the screen overflowed with 48 px rows), never under `min` (one
 * glyph cell). A short landscape phone cannot fit every menu at 48 px, so the rows take what fits.
 */
export function rowHeight(overflow: number, rows: number, min: number, max = TOUCH_ROW): number {
  if (rows <= 0 || overflow <= 0) return max;
  return Math.max(min, max - Math.ceil(overflow / rows));
}

/** Whether a window of this size is taller than it is wide (a phone held upright). */
export const isPortrait = (width: number, height: number): boolean => height > width;

/** The credits roll's transform for a given distance travelled, in whole CSS pixels. */
export const creditsTransform = (viewport: number, offset: number): string =>
  `translateY(${Math.round(viewport - offset)}px)`;

/** How far a sound caption floats up, in pixels. */
const CAPTION_RISE = 24;

/**
 * A sound caption's animation: it rises one pixel at a time and fades, with no scaling, so the
 * pixel font is never resampled to a fractional size or position.
 */
export function captionAnimation(): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } {
  return {
    keyframes: [
      { transform: 'translateY(0px)', opacity: 1 },
      { transform: `translateY(-${CAPTION_RISE}px)`, opacity: 0 },
    ],
    options: { duration: 950, easing: `steps(${CAPTION_RISE}, end)` },
  };
}

/** The top-left corner, in whole pixels, that centres a caption of this size on a point. */
export const captionPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } => ({
  left: Math.round(x - width / 2),
  top: Math.round(y - height / 2),
});
