// Draws the launcher's state as buttons: real focusable controls, so the keyboard, touch and the gamepad all work.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { rowsOf, type LauncherState, type RowId } from './state';

declare const __APP_VERSION__: string | undefined;

/** The app's version, set at build time from the player package; 'dev' where nothing sets it. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const TITLES = { home: 'Lieutenant Fizz', about: 'About' } as const;

/** Rebuilds the screen. The row that had focus keeps it, so a pad or keyboard player is not sent back to the top. */
export function render(
  root: HTMLElement,
  state: LauncherState,
  onActivate: (row: RowId) => void,
): void {
  const focused = (document.activeElement as HTMLElement | null)?.dataset.row;
  const title = document.createElement('h1');
  title.textContent = TITLES[state.screen];
  const list = document.createElement('div');
  list.className = 'rows';
  for (const row of rowsOf(state)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.row = row.id;
    const label = document.createElement('span');
    label.textContent = row.label;
    button.append(label);
    if (row.id === 'version') {
      const value = document.createElement('small');
      value.textContent = APP_VERSION;
      button.append(value);
    }
    button.addEventListener('click', () => onActivate(row.id));
    list.append(button);
  }
  root.replaceChildren(title, list);
  const target =
    list.querySelector<HTMLElement>(`[data-row="${focused}"]`) ??
    list.querySelector<HTMLElement>('button');
  if (document.hasFocus() || focused) target?.focus();
}
