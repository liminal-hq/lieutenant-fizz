// Draws the launcher's state with the shared menu rows: real buttons, so the keyboard, touch and gamepad all work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { renderRows, type BulletImage, type RowItem } from '@lieutenant-fizz/engine/menu/rows';
import { swipeDirection } from '@lieutenant-fizz/engine/menu/swipe';
import { currentStop, rowsOf, type LauncherState, type RowId } from './state';

declare const __APP_VERSION__: string | undefined;

/** The app's version, set at build time from the player package; 'dev' where nothing sets it. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** How long after a swipe a tap on a row is ignored, so the lift that ends a swipe does not choose the row under it. */
export const SWIPE_TAP_GUARD_MS = 350;

const SCREEN_TITLES = { load: 'Load game', about: 'About', settings: 'Settings' } as const;

/** What the heading of the carousel says for the stop showing. */
export function stopTitle(state: LauncherState): string {
  const stop = currentStop(state);
  if (stop.kind === 'app') return 'App settings';
  return stop.title ? `Episode ${stop.number} · ${stop.title}` : `Episode ${stop.number}`;
}

export interface ViewHooks {
  onActivate(row: RowId): void;
  /** The player moved the cursor (the pad, keyboard or a tab: not the page's own focus). */
  onMove(): void;
  /** The player asked for the next (1) or previous (-1) stop: an arrow, or a swipe. */
  onStop(dir: -1 | 1): void;
}

export interface View {
  /** Redraws for a new state, keeping the selected row where it still exists. */
  render(state: LauncherState): void;
  /** Draws a state as a preview (the screen Back goes to, behind a peek) without taking the selection from the real one. */
  preview(state: LauncherState): void;
  /** Sets the bullet beside the selected row. */
  setBullet(bullet: BulletImage | undefined): void;
  /** Moves the selection to the next (1) or previous (-1) row that is not dimmed, wrapping round. */
  step(delta: -1 | 1): void;
  /** Chooses the selected row, for a key press when focus is not on a row. */
  activateSelected(): void;
  /** The row selected now. */
  selectedRow(): RowId | undefined;
  /** Whether focus is on one of the menu's rows. */
  rowHasFocus(): boolean;
}

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

/**
 * The launcher's page: the carousel heading with its arrows and pips, then the menu. The selected row follows
 * focus (the pad and keyboard move focus; the pointer moves it too), so what is highlighted is always what Enter,
 * A or a tap will choose. A swipe sideways steps to another stop.
 */
export function createView(root: HTMLElement, hooks: ViewHooks): View {
  let ids: RowId[] = [];
  let selected: RowId | undefined;
  let bullet: BulletImage | undefined;
  let last: LauncherState | undefined;
  // Focus the page itself puts on a row (a redraw, the pointer coming over) is not the player moving the cursor.
  let quiet = false;
  let tapGuardUntil = 0;

  const prev = make('button', 'arrow prev');
  prev.type = 'button';
  prev.textContent = '◄';
  prev.setAttribute('aria-label', 'Previous');
  const next = make('button', 'arrow next');
  next.type = 'button';
  next.textContent = '►';
  next.setAttribute('aria-label', 'Next');
  const title = make('h1');
  const header = make('header', 'carousel');
  header.append(prev, title, next);
  const pips = make('div', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  const menu = make('div', 'menu');
  root.replaceChildren(header, pips, menu);

  prev.addEventListener('click', () => hooks.onStop(-1));
  next.addEventListener('click', () => hooks.onStop(1));

  const mark = (id: RowId | undefined): void => {
    selected = id;
    const at = id === undefined ? -1 : ids.indexOf(id);
    menu.dataset['sel'] = String(at);
    menu
      .querySelectorAll<HTMLElement>('button')
      .forEach((b, i) => b.classList.toggle('sel', i === at));
  };

  // The pad and keyboard move focus; the selection follows.
  menu.addEventListener('focusin', (e) => {
    const i = Number((e.target as HTMLElement).closest('button')?.dataset['i']);
    const id = Number.isInteger(i) ? ids[i] : undefined;
    if (!id) return;
    const moved = id !== selected;
    mark(id);
    if (moved && !quiet) hooks.onMove();
  });

  // A swipe sideways steps to the next or previous stop.
  let down: { x: number; y: number } | undefined;
  root.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dir = swipeDirection(e.clientX - down.x, e.clientY - down.y);
    down = undefined;
    if (dir === 0) return;
    tapGuardUntil = performance.now() + SWIPE_TAP_GUARD_MS;
    hooks.onStop(dir);
  });
  root.addEventListener('pointercancel', () => {
    down = undefined;
  });
  root.addEventListener(
    'click',
    (e) => {
      if (performance.now() < tapGuardUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );

  const draw = (state: LauncherState): void => {
    const rows = rowsOf(state);
    const had = document.activeElement && menu.contains(document.activeElement);
    ids = rows.map((r) => r.id);
    const home = state.screen === 'home';
    header.dataset['sub'] = home ? '' : 'true';
    title.textContent = home ? stopTitle(state) : SCREEN_TITLES[state.screen];
    prev.hidden = next.hidden = pips.hidden = !home;
    prev.disabled = state.stop <= 0;
    next.disabled = state.stop >= state.stops.length - 1;
    pips.replaceChildren(
      ...state.stops.map((_, i) => {
        const pip = make('i');
        if (i === state.stop) pip.className = 'on';
        return pip;
      }),
    );
    const items: RowItem[] = rows.map((r) => {
      const value = r.id === 'version' ? APP_VERSION : r.value;
      return {
        label: r.label,
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.meter !== undefined ? { meter: r.meter } : {}),
        ...(value ? { value } : {}),
        ...(r.disabled ? { disabled: true } : {}),
      };
    });
    // A dimmed row is never selected: start on the first one that is not.
    const free = rows.findIndex((r) => !r.disabled);
    const kept = selected === undefined ? -1 : ids.indexOf(selected);
    const at = kept >= 0 && !rows[kept]?.disabled ? kept : Math.max(0, free);
    renderRows(menu, items, at, {
      bullet,
      onClick: (i) => {
        const id = ids[i];
        if (id) hooks.onActivate(id);
      },
      onHover: (i, e) => {
        if (e.pointerType !== 'mouse' || rows[i]?.disabled) return;
        quiet = true;
        menu.querySelectorAll<HTMLElement>('button')[i]?.focus({ preventScroll: true });
        quiet = false;
      },
    });
    mark(free < 0 ? undefined : ids[at]);
    // Keep the pad's place; on first load there is nothing to keep, so the first row is only highlighted.
    if (had && free >= 0) {
      quiet = true;
      menu.querySelectorAll<HTMLElement>('button')[at]?.focus({ preventScroll: true });
      quiet = false;
    }
  };

  return {
    render(state) {
      last = state;
      draw(state);
    },
    preview(state) {
      const keep = selected;
      draw(state);
      selected = keep;
    },
    setBullet(nextBullet) {
      bullet = nextBullet;
      if (last) draw(last);
    },
    step(delta) {
      if (!last) return;
      const rows = rowsOf(last);
      const open = rows.map((r, i) => (r.disabled ? -1 : i)).filter((i) => i >= 0);
      if (open.length === 0) return;
      const at = selected === undefined ? -1 : open.indexOf(ids.indexOf(selected));
      const next = open[(at + delta + open.length) % open.length];
      if (next !== undefined)
        menu.querySelectorAll<HTMLElement>('button')[next]?.focus({ preventScroll: true });
    },
    activateSelected() {
      if (selected !== undefined) hooks.onActivate(selected);
    },
    selectedRow() {
      return selected;
    },
    rowHasFocus() {
      return !!document.activeElement && menu.contains(document.activeElement);
    },
  };
}
