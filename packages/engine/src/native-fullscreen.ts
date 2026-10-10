// The desktop app's fullscreen: the native window goes fullscreen, and the OS leaves Esc to the game.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ExitResult, FullscreenBackend } from './fullscreen-backend';
import type { FullscreenResult } from './lifecycle';

/** The part of Tauri's `Window` the backend uses; tests pass a fake. */
export interface NativeWindow {
  isFullscreen(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  /** Calls `fn` when the window changes size, which is how a fullscreen change shows up. Resolves to the unsubscribe function. */
  onResized(fn: () => void): Promise<() => void>;
}

/** The current Tauri window, loaded only when asked for so the web bundle never carries the Tauri API. */
export async function currentNativeWindow(): Promise<NativeWindow> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/**
 * Fullscreen for the desktop app, on the native window. `escapeCaptured` is always true: the OS does not
 * take Esc from a native fullscreen window, so the game sees it and the Esc rules apply (the first Esc
 * pauses, the next leaves fullscreen from the pause menu). The state is read once and then followed
 * through the window's resize events, so `isFullscreen()` stays synchronous; it also follows the window
 * manager's own way in and out (a title-bar button, the OS's shortcut). Failures are swallowed, as the
 * interface says.
 */
export async function nativeFullscreenBackend(
  win: NativeWindow | Promise<NativeWindow> = currentNativeWindow(),
): Promise<FullscreenBackend> {
  const w = await win;
  let fullscreen = await w.isFullscreen().catch(() => false);
  const handlers = new Set<() => void>();
  const set = (next: boolean): void => {
    if (next === fullscreen) return;
    fullscreen = next;
    for (const h of [...handlers]) h();
  };
  const refresh = (): void => void w.isFullscreen().then(set, () => {});
  const unlisten = await w.onResized(refresh).catch(() => () => {});
  return {
    kind: 'native',
    isFullscreen: () => fullscreen,
    async enter(plan): Promise<FullscreenResult> {
      if (!plan.fullscreen) return { fullscreen: 'skipped', lock: 'skipped' };
      try {
        await w.setFullscreen(true);
        set(true);
        return { fullscreen: 'ok', lock: 'skipped' };
      } catch {
        return { fullscreen: 'denied', lock: 'skipped' };
      }
    },
    async exit(): Promise<ExitResult> {
      if (!fullscreen) return 'skipped';
      try {
        await w.setFullscreen(false);
        set(false);
        return 'ok';
      } catch {
        return 'denied';
      }
    },
    onChange(fn) {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },
    escapeCaptured: true,
    dispose(): void {
      unlisten();
      handlers.clear();
    },
  };
}

/** A window with no OS behind it, for `?debug&host=fake-desktop` and tests: fullscreen is a flag, and `resized()` fires the resize event by hand. */
export function fakeNativeWindow(): NativeWindow & { resized(): void } {
  let fullscreen = false;
  const listeners = new Set<() => void>();
  return {
    isFullscreen: async () => fullscreen,
    setFullscreen: async (value) => {
      fullscreen = value;
    },
    onResized: async (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    resized: () => listeners.forEach((fn) => fn()),
  };
}
