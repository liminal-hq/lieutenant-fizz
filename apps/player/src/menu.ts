// Gamepad support for the player app's pages: focus moves between controls, A activates, B leaves the other pages.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  pickFocus,
  pollPads,
  stepValue,
  type Direction,
  type PadIntent,
  type PadSnapshot,
  type PadState,
} from './menu-pad';

// Pages opt in with `data-pad`: "menu" is the top menu (B does nothing), any other value leaves with B.
const mode = document.body.dataset.pad;
const FOCUSABLE = 'a[href], button, select, input, textarea, summary, [tabindex]';

if (mode) {
  const style = document.createElement('style');
  style.textContent = `[data-pad] :is(${FOCUSABLE}):focus { outline: 4px solid #ffff55; outline-offset: 2px; }`;
  document.head.append(style);
}

const snapshot = (pad: Gamepad): PadSnapshot => ({
  buttons: pad.buttons.map((b) => b.pressed),
  axes: pad.axes,
});

/** Focusable controls that are on screen and enabled, in document order. */
const controls = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.matches(':disabled') || el.tabIndex < 0 || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

const focusables = (): { list: HTMLElement[]; at: number } => {
  const list = controls();
  return { list, at: list.indexOf(document.activeElement as HTMLElement) };
};

const focusAt = (el: HTMLElement | undefined) => {
  el?.focus();
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const fire = (el: HTMLElement) => {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Left and right adjust a focused slider or select instead of moving focus. Returns whether it did. */
const adjust = (el: Element | null, dir: Direction): boolean => {
  if (dir !== 'left' && dir !== 'right') return false;
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const step = Number(el.step) > 0 ? Number(el.step) : 1;
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    el.value = String(stepValue(Number(el.value), min, max, step, dir));
    fire(el);
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const next = Math.min(
      el.options.length - 1,
      Math.max(0, el.selectedIndex + (dir === 'right' ? 1 : -1)),
    );
    if (next !== el.selectedIndex) {
      el.selectedIndex = next;
      fire(el);
    }
    return true;
  }
  return false;
};

const onIntent = (intent: Exclude<PadIntent, null>) => {
  if (!mode) return;
  if (intent === 'back') {
    if (mode !== 'menu') location.href = 'index.html';
    return;
  }
  const { list, at } = focusables();
  if (intent === 'wake') {
    if (at < 0) focusAt(list[0]);
  } else if (intent === 'activate') {
    (document.activeElement as HTMLElement | null)?.click();
  } else if (!adjust(document.activeElement, intent)) {
    const boxes = list.map((el) => el.getBoundingClientRect());
    focusAt(list[pickFocus(boxes, at, intent)]);
  }
};

const states: PadState[] = [];
const frame = (now: number) => {
  const pads = navigator.getGamepads?.() ?? [];
  pollPads(states, { getPads: () => pads.map((p) => (p ? snapshot(p) : null)), onIntent }, now);
  requestAnimationFrame(frame);
};
if (mode) requestAnimationFrame(frame);
