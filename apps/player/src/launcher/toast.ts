// A short message over the launcher: the native toast on Android, and a snackbar the page draws itself everywhere else.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HostKind } from '@lieutenant-fizz/engine/host';

/** How long a message stays up. */
export const TOAST_MS = 2600;

/** Shows a message, replacing any that is still up. */
export type Toast = (message: string) => void;

/** The toast plugin's show command, and the event its desktop side emits for the page to draw. */
export const SHOW_COMMAND = 'plugin:toast|show';
export const SHOW_EVENT = 'toast:show';

/** What the app gives the toast: the host, a snackbar to draw with, and the Tauri calls (absent on the web). */
export interface ToastDeps {
  kind: HostKind;
  snackbar: Toast;
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  listen?: (
    event: string,
    handler: (e: { payload: { message?: unknown } }) => void,
  ) => Promise<unknown>;
}

/**
 * One way to show a message wherever the launcher runs. Android shows the plugin's native toast. The desktop
 * app asks the plugin too, and the plugin answers with an event that is drawn as the snackbar, so both go through
 * one call. The web, and any call that fails, draws the snackbar directly.
 */
export async function createToast(deps: ToastDeps): Promise<Toast> {
  const { kind, snackbar, invoke, listen } = deps;
  if (!invoke || kind === 'web' || kind === 'tauri-ios') return snackbar;
  if (kind === 'tauri-desktop') {
    try {
      await listen?.(SHOW_EVENT, (e) => {
        if (typeof e.payload.message === 'string') snackbar(e.payload.message);
      });
    } catch {
      return snackbar;
    }
  }
  return (message) => {
    invoke(SHOW_COMMAND, { payload: { message, duration: 'short', position: 'bottom' } }).catch(
      () => snackbar(message),
    );
  };
}

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
