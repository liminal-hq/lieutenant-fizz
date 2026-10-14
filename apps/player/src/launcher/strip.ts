// The demo strip behind the menu: the episode's scenery scrolling past with Ben running and hopping along it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { StripArt } from './catalog';

/** How much of the window's height the strip may take. */
export const STRIP_SHARE = 0.42;

/** The most the strip is scaled up. */
export const MAX_STRIP_SCALE = 5;

/**
 * How many CSS pixels each pixel of the strip covers: a whole number, so the pixel art stays crisp, as large as
 * fits in its share of the window's height and never under 1.
 */
export function stripScale(viewportHeight: number, artHeight: number): number {
  if (artHeight <= 0) return 1;
  return Math.max(
    1,
    Math.min(MAX_STRIP_SCALE, Math.floor((viewportHeight * STRIP_SHARE) / artHeight)),
  );
}

/** Where the ground is in the strip, from the bottom, in strip pixels: Ben's feet stand there. */
export const GROUND_FROM_BOTTOM = 32;

export interface Strip {
  /** Sizes the strip for a window of this height. */
  resize(viewportHeight: number): void;
  remove(): void;
}

/** Adds the strip to `parent`, behind whatever comes after it. The pictures are found relative to `base`. */
export function createStrip(parent: HTMLElement, art: StripArt, base: URL): Strip {
  const el = document.createElement('div');
  el.className = 'strip';
  el.setAttribute('aria-hidden', 'true');
  const stripUrl = new URL(art.strip.src, base).href;
  const runnerUrl = new URL(art.runner.src, base).href;
  el.style.setProperty('--strip-w', String(art.strip.width));
  el.style.setProperty('--strip-h', String(art.strip.height));
  el.style.setProperty('--strip-image', `url("${stripUrl}")`);
  el.style.setProperty('--ben-w', String(art.runner.width));
  el.style.setProperty('--ben-h', String(art.runner.height));
  el.style.setProperty('--ben-frames', String(art.runner.frames));
  el.style.setProperty('--ben-image', `url("${runnerUrl}")`);
  el.style.setProperty('--ground', String(GROUND_FROM_BOTTOM));
  const ben = document.createElement('div');
  ben.className = 'ben';
  const run = document.createElement('div');
  run.className = 'run';
  const air = document.createElement('div');
  air.className = 'air';
  ben.append(run, air);
  el.append(ben);
  parent.prepend(el);
  return {
    resize(viewportHeight) {
      el.style.setProperty('--strip-scale', String(stripScale(viewportHeight, art.strip.height)));
    },
    remove() {
      el.remove();
    },
  };
}
