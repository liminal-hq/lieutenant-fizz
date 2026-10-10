// Gamepad support for the player app's pages: focus moves through the menu links, and B leaves the other pages.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { nextFocus, pollPads, type PadIntent, type PadSnapshot, type PadState } from './menu-pad';

const isMenu = document.body.dataset.pad === 'menu';
const links = isMenu ? Array.from(document.querySelectorAll<HTMLAnchorElement>('nav a')) : [];

const snapshot = (pad: Gamepad): PadSnapshot => ({
  buttons: pad.buttons.map((b) => b.pressed),
  axes: pad.axes,
});

const focusStep = (step: -1 | 1) => {
  const at = links.indexOf(document.activeElement as HTMLAnchorElement);
  links[nextFocus(at, links.length, step)]?.focus();
};

const onIntent = (intent: Exclude<PadIntent, null>) => {
  if (intent === 'back') {
    if (!isMenu) location.href = 'index.html';
    return;
  }
  if (!isMenu) return;
  if (intent === 'wake') {
    if (!links.includes(document.activeElement as HTMLAnchorElement)) links[0]?.focus();
  } else if (intent === 'up') focusStep(-1);
  else if (intent === 'down') focusStep(1);
  else if (intent === 'activate') (document.activeElement as HTMLElement | null)?.click();
};

const states: PadState[] = [];
const frame = (now: number) => {
  const pads = navigator.getGamepads?.() ?? [];
  pollPads(states, { getPads: () => pads.map((p) => (p ? snapshot(p) : null)), onIntent }, now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
