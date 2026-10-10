// The Android Back gesture, through the Tauri predictive-back plugin: tells the system whether the game has an answer to Back and hears when the gesture completes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SwipeEdge } from './back-peek';
import type { HostKind } from './host';

/** The Tauri event the plugin emits for each frame of a back gesture. */
export const PREDICTIVE_BACK_EVENT = 'predictive-back:event';

/**
 * One frame of the native back gesture. `swipeEdge` is the edge the gesture came from; the plugin sends
 * it with `started` and `progress` only, and an older build does not send it at all.
 */
export interface PredictiveBackEvent {
  type: 'started' | 'progress' | 'cancelled' | 'invoked';
  progress: number;
  swipeEdge?: SwipeEdge;
}

/** What the game does with each frame of the gesture. Only `invoked` is needed; the rest drive the peek. */
export interface PredictiveBackHandlers {
  started?(edge: SwipeEdge | undefined): void;
  progress?(progress: number, edge: SwipeEdge | undefined): void;
  cancelled?(): void;
  invoked(): void;
}

/** `invoke` from Tauri, or a stand-in for tests. */
export type PredictiveInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** `listen` from Tauri, or a stand-in for tests; resolves with the function that stops listening. */
export type PredictiveListen = (
  event: string,
  handler: (event: { payload: PredictiveBackEvent }) => void,
) => Promise<() => void>;

/** What the game needs of the plugin. */
export interface PredictiveBackBackend {
  /**
   * Says whether the game has somewhere to go on Back. While true the system hands the gesture to the
   * game; while false it keeps it (the app backgrounds). Never rejects.
   */
  setCanGoBack(canGoBack: boolean): Promise<void>;
  /** Calls the handlers as a back gesture goes on, in the order the system sends the frames. Resolves with the function that stops listening. Never rejects. */
  onGesture(handlers: PredictiveBackHandlers): Promise<() => void>;
}

/** Tauri's `invoke`, loaded when first used so the web bundle never carries it. */
const tauriInvoke: PredictiveInvoke = async (cmd, args) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
};

/** Tauri's `listen`, loaded when first used so the web bundle never carries it. */
const tauriListen: PredictiveListen = async (event, handler) => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<PredictiveBackEvent>(event, handler);
};

/**
 * The plugin as a backend, or `undefined` anywhere but the Tauri Android app, which is the only host
 * with the gesture (the desktop plugin is a no-op stub and the web has the browser's own Back).
 * A failure to reach the plugin is logged and swallowed, so a missing plugin leaves Back to the system.
 */
export function createPredictiveBack(
  kind: HostKind,
  invoke: PredictiveInvoke = tauriInvoke,
  listen: PredictiveListen = tauriListen,
): PredictiveBackBackend | undefined {
  if (kind !== 'tauri-android') return undefined;
  return {
    async setCanGoBack(canGoBack) {
      try {
        await invoke('plugin:predictive-back|set_can_go_back', { payload: { canGoBack } });
      } catch (error) {
        console.warn('Telling the app whether Back has somewhere to go failed', error);
      }
    },
    async onGesture(handlers) {
      try {
        return await listen(PREDICTIVE_BACK_EVENT, ({ payload }) => {
          const edge =
            payload.swipeEdge === 'left' || payload.swipeEdge === 'right'
              ? payload.swipeEdge
              : undefined;
          switch (payload.type) {
            case 'started':
              handlers.started?.(edge);
              break;
            case 'progress':
              handlers.progress?.(payload.progress, edge);
              break;
            case 'cancelled':
              handlers.cancelled?.();
              break;
            case 'invoked':
              handlers.invoked();
              break;
          }
        });
      } catch (error) {
        console.warn('Listening for the Back gesture failed', error);
        return () => {};
      }
    },
  };
}
