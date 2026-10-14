// The custom properties that size a Fizz menu page, worked out from the window.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { pixelScale, scaleSteps, sidePadding, verticalPadding } from '../font/scale';

/**
 * The text scales and padding a menu page needs (`tokens.css` names them), for a window of this size. Every
 * scale is a whole number, so each glyph pixel is a whole number of CSS pixels. `large` is the Large text
 * option: one step up.
 */
export function menuScaleVars(
  width: number,
  height: number,
  large = false,
): Record<string, string> {
  const steps = scaleSteps(pixelScale(height, large));
  return {
    '--lf-n': String(steps.item),
    '--lf-n-small': String(steps.small),
    '--lf-n-head': String(steps.head),
    '--lf-n-hint': String(steps.hint),
    '--lf-cw-mul': String(steps.bullet),
    '--lf-pad-x': `${sidePadding(width)}px`,
    '--lf-pad-y': `${verticalPadding(height)}px`,
  };
}

/** Writes the scales onto an element (the document root). */
export function applyMenuScale(
  el: HTMLElement,
  width: number,
  height: number,
  large = false,
): void {
  for (const [name, value] of Object.entries(menuScaleVars(width, height, large))) {
    el.style.setProperty(name, value);
  }
}
