// Draws the launcher's state with the shared menu rows: real buttons, so the keyboard, touch and gamepad all work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  fillPlate,
  renderRows,
  type BulletImage,
  type RowItem,
  type RowsOptions,
} from '@lieutenant-fizz/engine/menu/rows';
import { MenuScroller } from '@lieutenant-fizz/engine/menu/scroller';
import { swipeDirection } from '@lieutenant-fizz/engine/menu/swipe';
import type { Stop } from './catalog';
import { currentStop, rowsOf, type LauncherState, type RowId } from './state';

declare const __APP_VERSION__: string | undefined;

/** The app's version, set at build time from the player package; 'dev' where nothing sets it. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** A row as drawn: the shared row, and a strip of tab names for the Settings heading. */
interface LauncherItem extends RowItem {
  tabs?: { names: readonly string[]; active: number };
}

/** How long after a swipe a tap on a row is ignored, so the lift that ends a swipe does not choose the row under it. */
export const SWIPE_TAP_GUARD_MS = 350;

const SCREEN_TITLES = {
  load: 'Load game',
  about: 'About',
  settings: 'Settings',
  saves: 'Saves',
} as const;

/** What the heading of the carousel says for the stop showing. */
export function stopTitle(state: LauncherState): string {
  const stop = currentStop(state);
  if (stop.kind === 'app') return 'App settings';
  return stop.title ? `Episode ${stop.number} · ${stop.title}` : `Episode ${stop.number}`;
}

/** The words of a wordmark. */
export interface Card {
  kicker: string;
  words: readonly string[];
}

export interface ViewHooks {
  /** The series logo shown above the carousel on the home screens, or undefined when there is none. */
  logo?(): Card | undefined;
  /** What the carousel says for a stop (an episode's name), or undefined for the plain heading. */
  nameOf?(stop: Stop): string | undefined;
  onActivate(row: RowId): void;
  /** The player moved the cursor (the pad, keyboard or a tab: not the page's own focus). */
  onMove(): void;
  /** The player asked for the next (1) or previous (-1) stop: an arrow, or a swipe. */
  onStop(dir: -1 | 1): void;
  /** A tab's name on the Settings strip was tapped: the index in the strip. */
  onTab(index: number): void;
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
  /** Lays the menu out again for a new window size, touch controls or row height, scrolling it if it no longer fits. */
  relayout(): void;
  /** Whether focus is on one of the menu's rows. */
  rowHasFocus(): boolean;
}

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
  children?: readonly Node[],
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (children) node.append(...children);
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
  // The series logo stands still above the carousel; only the name beside the arrows changes from stop to stop.
  const head = make('div', 'head');
  head.hidden = true;
  const title = make('h2');
  const header = make('header', 'carousel');
  header.append(prev, title, next);
  const pips = make('div', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  // The Settings tab strip stands above the menu, outside what scrolls, so it keeps its place from tab to tab.
  const bar = make('div', 'menu pinned');
  bar.hidden = true;
  const menu = make('div', 'menu');
  root.replaceChildren(head, header, pips, bar, menu);
  /** How many rows the pinned bar holds (0 or 1): the menu's own rows are numbered after them. */
  let offset = 0;
  /** Every row's button, the bar's first. */
  const buttons = (): HTMLElement[] => [
    ...bar.querySelectorAll<HTMLElement>('button'),
    ...menu.querySelectorAll<HTMLElement>('button'),
  ];
  // A menu taller than the room scrolls, with chevrons at its edges (as the game's does).
  const scroller = new MenuScroller();
  scroller.attach(root, menu);
  const fit = (): void => {
    const touch = matchMedia('(pointer: coarse)').matches;
    const row = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--lf-menu-row'),
    );
    scroller.fit([root], { minRow: touch ? row || 40 : 0 });
  };

  prev.addEventListener('click', () => hooks.onStop(-1));
  next.addEventListener('click', () => hooks.onStop(1));

  const mark = (id: RowId | undefined): void => {
    selected = id;
    const at = id === undefined ? -1 : ids.indexOf(id);
    // The menu numbers its own rows, so the scroller finds the selected one; the bar has none to find.
    menu.dataset['sel'] = String(Math.max(0, at - offset));
    buttons().forEach((b, i) => b.classList.toggle('sel', i === at));
  };

  // The pad and keyboard move focus; the selection follows.
  root.addEventListener('focusin', (e) => {
    const i = Number((e.target as HTMLElement).closest('button')?.dataset['i']);
    const id = Number.isInteger(i) ? ids[i] : undefined;
    if (!id) return;
    const moved = id !== selected;
    mark(id);
    if (moved && !quiet) {
      if (ids.indexOf(id) < offset) menu.scrollTop = 0;
      else scroller.reveal(menu);
      hooks.onMove();
    }
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

  /**
   * Sizes the logo to the largest whole scale (from the engine's 5 down to 2) whose heading fits the width between
   * the arrows and takes no more than about a third of the window's height, so the menu keeps its room.
   */
  const fitLogo = (on: boolean): void => {
    const style = root.style;
    style.removeProperty('--lf-n-logo');
    if (!on) return;
    const room = header.clientWidth - 16;
    for (let n = 5; n >= 2; n--) {
      style.setProperty('--lf-n-logo', String(n));
      // The logo and the carousel line under it take about a third of the window's height between them.
      if (
        head.scrollWidth <= room &&
        head.offsetHeight + header.offsetHeight <= innerHeight * 0.34
      ) {
        return;
      }
    }
  };

  /** Slides the episode's name in from the side the carousel stepped towards, unless motion is reduced. */
  const slideName = (dir: -1 | 1): void => {
    const reduced =
      document.getElementById('ui')?.classList.contains('rm') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof title.animate !== 'function') return;
    title.animate(
      [
        { transform: `translateX(${dir * 48}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 240, easing: 'ease-out' },
    );
  };

  const draw = (state: LauncherState): void => {
    const rows = rowsOf(state);
    const had =
      document.activeElement &&
      (menu.contains(document.activeElement) || bar.contains(document.activeElement));
    ids = rows.map((r) => r.id);
    const home = state.screen === 'home';
    header.dataset['sub'] = home ? '' : 'true';
    const stop = currentStop(state);
    const logo = home ? hooks.logo?.() : undefined;
    root.classList.toggle('lf-title', !!logo);
    head.hidden = !logo;
    if (logo) {
      const wordmark = make('h1', 'wordmark', undefined, [
        make('span', 'kicker', logo.kicker),
        make('span', 'logo', undefined, [
          make(
            'span',
            'hero',
            undefined,
            logo.words.flatMap((w, i) => [
              ...(i > 0 ? [document.createTextNode(' ')] : []),
              make('span', 'w', w),
            ]),
          ),
        ]),
      ]);
      wordmark.setAttribute('aria-label', logo.words.join(' '));
      head.replaceChildren(wordmark);
    }
    title.textContent = home
      ? ((logo ? hooks.nameOf?.(stop) : undefined) ?? stopTitle(state))
      : SCREEN_TITLES[state.screen];
    prev.hidden = next.hidden = pips.hidden = !home;
    // The carousel loops, so both arrows work wherever there is more than one stop.
    prev.disabled = next.disabled = state.stops.length < 2;
    pips.replaceChildren(
      ...state.stops.map((_, i) => {
        const pip = make('i');
        if (i === state.stop) pip.className = 'on';
        return pip;
      }),
    );
    const items: LauncherItem[] = rows.map((r) => {
      const value = r.id === 'version' ? APP_VERSION : r.value;
      return {
        label: r.label,
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.meter !== undefined ? { meter: r.meter } : {}),
        ...(r.tabs ? { tabs: r.tabs } : {}),
        ...(value ? { value } : {}),
        ...(r.disabled ? { disabled: true } : {}),
      };
    });
    // A dimmed row is never selected: start on the first one that is not.
    const free = rows.findIndex((r) => !r.disabled);
    const kept = selected === undefined ? -1 : ids.indexOf(selected);
    const at = kept >= 0 && !rows[kept]?.disabled ? kept : Math.max(0, free);
    // A tab strip is pinned above the menu; the rest scroll.
    offset = items[0]?.tabs ? 1 : 0;
    bar.hidden = offset === 0;
    const options: Omit<RowsOptions<LauncherItem>, 'onClick'> = {
      bullet,
      decorate: (button, item) => {
        if (item.tabs) button.classList.add('tabstrip');
      },
      fill: (plate, item, state) => {
        if (!item.tabs) return fillPlate(plate, item, state.selected);
        item.tabs.names.forEach((name, k) => {
          const tab = make('span', k === item.tabs?.active ? 'tab on' : 'tab');
          tab.textContent = name;
          tab.addEventListener('click', (e) => {
            e.stopPropagation();
            hooks.onTab(k);
          });
          plate.append(tab);
        });
      },
    };
    /** The options for rows that start at `from` in the whole list (the buttons are numbered from `from`). */
    const forRows = (from: number): RowsOptions<LauncherItem> => ({
      ...options,
      onClick: (i) => {
        const id = ids[from + i];
        if (id) hooks.onActivate(id);
      },
      onHover: (i, e) => {
        if (e.pointerType !== 'mouse' || rows[from + i]?.disabled) return;
        quiet = true;
        buttons()[from + i]?.focus({ preventScroll: true });
        quiet = false;
      },
    });
    renderRows(bar, items.slice(0, offset), at < offset ? at : -1, forRows(0));
    renderRows(menu, items.slice(offset), at - offset, forRows(offset));
    menu.querySelectorAll<HTMLElement>('button').forEach((b, i) => {
      b.dataset['i'] = String(i + offset);
    });
    fitLogo(!!logo);
    mark(free < 0 ? undefined : ids[at]);
    fit();
    // Keep the pad's place; on first load there is nothing to keep, so the first row is only highlighted.
    if (had && free >= 0) {
      quiet = true;
      buttons()[at]?.focus({ preventScroll: true });
      quiet = false;
    }
  };

  return {
    render(state) {
      const before = last;
      last = state;
      draw(state);
      if (before?.screen === 'home' && state.screen === 'home' && before.stop !== state.stop) {
        // The name slides in from the side the carousel stepped towards, as the scenery does.
        const n = state.stops.length;
        slideName((state.stop - before.stop + n) % n === 1 ? 1 : -1);
      }
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
      if (next !== undefined) buttons()[next]?.focus({ preventScroll: true });
    },
    activateSelected() {
      if (selected !== undefined) hooks.onActivate(selected);
    },
    selectedRow() {
      return selected;
    },
    relayout: fit,
    rowHasFocus() {
      const at = document.activeElement;
      return !!at && (menu.contains(at) || bar.contains(at));
    },
  };
}
