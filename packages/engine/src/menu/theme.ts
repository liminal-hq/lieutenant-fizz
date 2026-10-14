// What an episode hands the shared menus to give them its look: colours, the plate's steps and the bullet's sprite.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Grid } from '../pen';

/** The colours a menu reads, as CSS colours. Any left out keep the page's defaults (`tokens.css`). */
export interface MenuColours {
  /** Row text. */
  text?: string;
  /** Disabled rows and quiet text. */
  dim?: string;
  /** The selected row's plate. */
  accent?: string;
  /** Values beside a row's label. */
  muted?: string;
  /** Text on the plate. */
  ink?: string;
}

/**
 * An episode's menu look. The engine owns how a menu is laid out and how it behaves; this is only what it
 * looks like, so another episode can have other colours and a different (animated) bullet.
 */
export interface MenuTheme {
  colours?: MenuColours;
  /** The three colours the selected row's plate steps through, in turn. */
  plate?: readonly [string, string, string];
  /** The bullet beside the selected row: one picture, or frames played in turn. */
  bullet?: Grid | readonly Grid[];
  /** How long each bullet frame shows, in milliseconds. */
  bulletStepMs?: number;
}

/** How long each bullet frame shows when the theme does not say. */
export const BULLET_STEP_MS = 350;

const COLOUR_VARS: readonly (readonly [keyof MenuColours, string])[] = [
  ['text', '--lf-text'],
  ['dim', '--lf-dim'],
  ['accent', '--lf-accent'],
  ['muted', '--lf-muted'],
  ['ink', '--lf-ink'],
];

/** The custom properties a theme sets: only those it gives, so the page's defaults fill the rest. */
export function themeVars(theme: MenuTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, name] of COLOUR_VARS) {
    const value = theme.colours?.[key];
    if (value) vars[name] = value;
  }
  if (theme.plate) {
    vars['--lf-plate-a'] = theme.plate[0];
    vars['--lf-plate-b'] = theme.plate[1];
    vars['--lf-plate-c'] = theme.plate[2];
  }
  return vars;
}

/** Sets the theme's properties on an element: the document root, or the page's `#ui`. */
export function applyMenuTheme(el: HTMLElement, theme: MenuTheme): void {
  for (const [name, value] of Object.entries(themeVars(theme))) el.style.setProperty(name, value);
}

/** The bullet's frames: none for no bullet, one for a still picture. */
export function bulletFrames(theme: MenuTheme): readonly Grid[] {
  const b = theme.bullet;
  if (!b) return [];
  // An array has an `at` method too, so a grid is told apart by not being one.
  return Array.isArray(b) ? (b as readonly Grid[]) : [b as Grid];
}

/** How long a whole run of the bullet's frames takes, in milliseconds. */
export function bulletCycleMs(theme: MenuTheme): number {
  return Math.max(1, bulletFrames(theme).length) * (theme.bulletStepMs ?? BULLET_STEP_MS);
}
