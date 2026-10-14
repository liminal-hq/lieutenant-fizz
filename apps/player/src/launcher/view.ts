// Draws the launcher's state with the shared menu rows: real buttons, so the keyboard, touch and gamepad all work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { renderRows, type BulletImage, type RowItem } from '@lieutenant-fizz/engine/menu/rows';
import { rowsOf, type LauncherState, type RowId } from './state';

declare const __APP_VERSION__: string | undefined;

/** The app's version, set at build time from the player package; 'dev' where nothing sets it. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const TITLES = { home: 'Lieutenant Fizz', about: 'About' } as const;

export interface View {
  /** Redraws for a new state, keeping the selected row where it still exists. */
  render(state: LauncherState): void;
  /** Sets the bullet beside the selected row. */
  setBullet(bullet: BulletImage | undefined): void;
}

/**
 * The launcher's page. The selected row follows focus (the pad and keyboard move focus; the pointer moves it
 * too), so what is highlighted is always what Enter, A or a tap will choose.
 */
export function createView(root: HTMLElement, onActivate: (row: RowId) => void): View {
  let ids: RowId[] = [];
  let selected: RowId | undefined;
  let bullet: BulletImage | undefined;
  let last: LauncherState | undefined;
  const title = document.createElement('h1');
  const menu = document.createElement('div');
  menu.className = 'menu';
  root.replaceChildren(title, menu);

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
    if (Number.isInteger(i) && ids[i]) mark(ids[i]);
  });

  const draw = (state: LauncherState): void => {
    const rows = rowsOf(state);
    const had = document.activeElement && menu.contains(document.activeElement);
    ids = rows.map((r) => r.id);
    title.textContent = TITLES[state.screen];
    const items: RowItem[] = rows.map((r) => ({
      label: r.label,
      ...(r.id === 'version' ? { value: APP_VERSION } : {}),
    }));
    const at = Math.max(0, selected === undefined ? 0 : ids.indexOf(selected));
    renderRows(menu, items, at, {
      bullet,
      onClick: (i) => {
        const id = ids[i];
        if (id) onActivate(id);
      },
      onHover: (i, e) => {
        if (e.pointerType !== 'mouse') return;
        menu.querySelectorAll<HTMLElement>('button')[i]?.focus({ preventScroll: true });
      },
    });
    mark(ids[at]);
    // Keep the pad's place; on first load there is nothing to keep, so the first row is only highlighted.
    if (had) menu.querySelectorAll<HTMLElement>('button')[at]?.focus({ preventScroll: true });
  };

  return {
    render(state) {
      last = state;
      draw(state);
    },
    setBullet(next) {
      bullet = next;
      if (last) draw(last);
    },
  };
}
