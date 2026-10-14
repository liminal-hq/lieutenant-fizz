// A short message over the launcher: the native toast on Android, and a snackbar the page draws itself everywhere else.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HostKind } from '@lieutenant-fizz/engine/host';

/** How long a message stays up. */
export const TOAST_MS = 2600;

export interface ToastOptions {
  /**
   * Takes down the message showing first (the default), so a quick run of messages such as a count ends with
   * only the last one. With `false` the message waits its turn behind the ones already up.
   */
  replace?: boolean;
}

/** Shows a message. */
export type Toast = (message: string, options?: ToastOptions) => void;

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
    handler: (e: { payload: { message?: unknown; replace?: unknown } }) => void,
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
        if (typeof e.payload.message === 'string') {
          snackbar(e.payload.message, { replace: e.payload.replace !== false });
        }
      });
    } catch {
      return snackbar;
    }
  }
  return (message, options) => {
    const replace = options?.replace ?? true;
    invoke(SHOW_COMMAND, {
      payload: { message, duration: 'short', position: 'bottom', replace },
    }).catch(() => snackbar(message, options));
  };
}

/** What the snackbar draws with, so its timing and queue can be tested without a page. */
export interface SnackbarView {
  show(message: string): void;
  hide(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The snackbar's timing: a message stays up for `ms`. A new message replaces the one showing (and drops any
 * waiting), unless it asks not to with `replace: false`, when it waits for the ones ahead of it.
 */
export function createSnackbarQueue(
  view: SnackbarView,
  ms: number = TOAST_MS,
  timers: Timers = realTimers,
): Toast {
  const waiting: string[] = [];
  let showing = false;
  let timer: unknown;
  const present = (message: string): void => {
    showing = true;
    view.show(message);
    timer = timers.set(next, ms);
  };
  function next(): void {
    const message = waiting.shift();
    if (message === undefined) {
      showing = false;
      view.hide();
    } else {
      present(message);
    }
  }
  return (message, options) => {
    if (options?.replace === false && showing) {
      waiting.push(message);
      return;
    }
    waiting.length = 0;
    timers.clear(timer);
    present(message);
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
  return createSnackbarQueue(
    {
      show: (message) => {
        el.textContent = message;
        el.hidden = false;
      },
      hide: () => {
        el.hidden = true;
      },
    },
    ms,
  );
}
