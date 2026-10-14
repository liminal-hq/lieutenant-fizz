// A short message over the launcher: a snackbar the page draws itself, so it works the same in a browser and in the app.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How long a message stays up. */
export const TOAST_MS = 2600;

/** Shows a message, replacing any that is still up. */
export type Toast = (message: string) => void;

/** A snackbar in `parent`: one element that is reused, announced politely to screen readers. */
export function createSnackbar(parent: HTMLElement = document.body, ms: number = TOAST_MS): Toast {
  const el = document.createElement('div');
  el.className = 'snackbar';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  parent.append(el);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (message) => {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, ms);
  };
}
