// Chooses the whole-number pixel scales for the overlay from the window size.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  pixelScale,
  scaleSteps,
  sidePadding,
  verticalPadding,
  wordmarkScale,
  wrapColumns,
} from '@lieutenant-fizz/engine/font/scale';

/** The CSS custom properties that size the overlay, for a window of this size. */
export function layoutVars(width: number, height: number, large: boolean): Record<string, string> {
  const steps = scaleSteps(pixelScale(height, large));
  const padX = sidePadding(width);
  return {
    '--lf-n': String(steps.item),
    '--lf-n-small': String(steps.small),
    '--lf-n-head': String(steps.head),
    '--lf-n-hint': String(steps.hint),
    '--lf-n-logo': String(wordmarkScale(width, padX, steps.item)),
    '--lf-cw-mul': String(steps.bullet),
    '--lf-pad-x': `${padX}px`,
    '--lf-pad-y': `${verticalPadding(height)}px`,
    '--lf-keys-bottom': `${Math.min(36, Math.max(16, Math.round(height * 0.04)))}px`,
    '--lf-cols': String(wrapColumns(width - 2 * padX, steps.small)),
  };
}

/** Writes the layout variables onto an element (the document root, so floating captions see them). */
export function applyLayout(el: HTMLElement, width: number, height: number, large: boolean): void {
  for (const [name, value] of Object.entries(layoutVars(width, height, large))) {
    el.style.setProperty(name, value);
  }
}

/**
 * Calls `onChange` whenever the window is resized. Returns a function that stops listening, so a
 * disposed game does not stay reachable through the window.
 */
export function watchResize(
  onChange: () => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  target.addEventListener('resize', onChange);
  return () => target.removeEventListener('resize', onChange);
}

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
