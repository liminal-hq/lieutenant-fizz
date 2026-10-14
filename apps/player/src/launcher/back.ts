// The launcher's answer to Back: the Android gesture through the predictive-back plugin and, in a browser, the history entry.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type {
  PredictiveBackBackend,
  PredictiveBackHandlers,
} from '@lieutenant-fizz/engine/predictive-back';

export interface LauncherBackDeps {
  /** The Android gesture; absent on every other host. */
  backend?: PredictiveBackBackend;
  /** The browser's history entry (`BackGuard`); absent where there is no browser Back to answer. */
  guard?: { set(want: boolean): void };
  /** Goes back one screen. */
  onBack(): void;
  /** The frames of the gesture before it completes, which drive the peek. */
  peek?: Omit<PredictiveBackHandlers, 'invoked'>;
}

export interface LauncherBack {
  /** Says whether the screen on show has somewhere to go on Back. */
  sync(canGoBack: boolean): void;
  /**
   * Hands Back to the system for good, and resolves once the plugin has the answer. Used before the launcher
   * leaves for another page: the plugin's callback outlives this page's listener, so a launcher that left with
   * Back still claimed would have every gesture swallowed.
   */
  release(): Promise<void>;
  /** Claims Back again after a `release` when the page was not left after all. */
  reclaim(canGoBack: boolean): void;
  /** Stops listening for the gesture. */
  dispose(): void;
}

/**
 * Wires Back for the launcher. While the screen has somewhere to go (About), the system hands the gesture to
 * the launcher; on the home screen the system keeps it and the app goes to the background.
 */
export async function createLauncherBack(deps: LauncherBackDeps): Promise<LauncherBack> {
  const { backend, guard, onBack } = deps;
  let sent: boolean | undefined;
  let released = false;
  let stop: (() => void) | undefined;
  if (backend) {
    stop = await backend.onGesture({ ...deps.peek, invoked: onBack });
  }
  const api: LauncherBack = {
    sync(canGoBack) {
      if (released) return;
      guard?.set(canGoBack);
      if (backend && canGoBack !== sent) {
        sent = canGoBack;
        void backend.setCanGoBack(canGoBack);
      }
    },
    async release() {
      released = true;
      guard?.set(false);
      if (backend && sent !== false) {
        sent = false;
        await backend.setCanGoBack(false);
      }
    },
    reclaim(canGoBack) {
      released = false;
      sent = undefined;
      api.sync(canGoBack);
    },
    dispose() {
      stop?.();
      stop = undefined;
    },
  };
  return api;
}
