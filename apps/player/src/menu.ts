// Gamepad support for the player app's pages: focus moves between controls, A activates, B leaves the other pages (or, on the launcher, is passed on as a `pad-back` event).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { createHostBackend, openPage } from '@lieutenant-fizz/engine/host';
import { createPredictiveBack } from '@lieutenant-fizz/engine/predictive-back';
import {
  pickFocus,
  pollPads,
  stepValue,
  type Direction,
  type PadIntent,
  type PadSnapshot,
  type PadState,
} from './menu-pad';

// Pages opt in with `data-pad`: "menu" is the launcher, which handles B itself (it hears a `pad-back` event on the document), and any other value leaves with B for the page named by `data-back` (the launcher when there is none).
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
  // The launcher shows the pad's hints once a pad is in use.
  if (mode === 'menu') document.dispatchEvent(new CustomEvent('pad-active'));
  if (intent === 'back') {
    if (mode === 'menu') document.dispatchEvent(new CustomEvent('pad-back'));
    else openPage(document.body.dataset.back ?? 'index.html');
    return;
  }
  // The launcher steps between its stops with left and right (a page that is not the launcher moves focus).
  if (mode === 'menu' && (intent === 'left' || intent === 'right')) {
    document.dispatchEvent(new CustomEvent(`pad-${intent}`));
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

// On Android, Back leaves these pages for the one named by `data-back`, as B does. The launcher (`menu`) answers
// Back itself; here the system is told Back has somewhere to go, and again when the page is left.
if (mode && mode !== 'menu') {
  const backend = createPredictiveBack(createHostBackend().kind);
  if (backend) {
    const leave = (): void => {
      // The plugin never rejects, but a call that hangs must not strand the page.
      const wait = new Promise<void>((resolve) => setTimeout(resolve, 300));
      void Promise.race([backend.setCanGoBack(false), wait]).then(() => {
        openPage(document.body.dataset.back ?? 'index.html');
      });
    };
    // A link that leaves the page releases Back too: the plugin's callback outlives this page's listener.
    addEventListener('pagehide', () => void backend.setCanGoBack(false));
    void backend.setCanGoBack(true);
    void backend.onGesture({ invoked: leave });
  }
}

// The app's pages replace one another, so Back never walks through pages the player has already left: a link to
// another page of the app opens in place of this one.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!link || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  // A link to a place on this page (a hash) stays an ordinary link; a link to the page itself opens it in place.
  if (url.hash && url.pathname === location.pathname && url.search === location.search) return;
  e.preventDefault();
  openPage(url.href);
});

const states: PadState[] = [];
const frame = (now: number) => {
  const pads = navigator.getGamepads?.() ?? [];
  pollPads(states, { getPads: () => pads.map((p) => (p ? snapshot(p) : null)), onIntent }, now);
  requestAnimationFrame(frame);
};
if (mode) requestAnimationFrame(frame);
