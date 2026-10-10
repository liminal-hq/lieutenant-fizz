// The Android Back gesture without Android: `?debug&host=fake-android` takes its frames from `window.__lfPredictiveBack`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  createPredictiveBack,
  type PredictiveBackBackend,
  type PredictiveBackEvent,
} from '@lieutenant-fizz/engine/predictive-back';

/** What a test reaches the fake gesture through. */
export interface FakePredictiveBackHook {
  /** Sends one frame of the gesture, as the plugin would: `progress` is 0 unless given. */
  emit(event: Partial<PredictiveBackEvent> & Pick<PredictiveBackEvent, 'type'>): void;
  /** What the game last told the system about Back (`null` before it has said). */
  canGoBack: boolean | null;
}

/** The plugin's backend over a fake host, with the hook installed on `target`. */
export function fakePredictiveBack(
  target: Window & { __lfPredictiveBack?: FakePredictiveBackHook },
): PredictiveBackBackend {
  const handlers = new Set<(event: { payload: PredictiveBackEvent }) => void>();
  const hook: FakePredictiveBackHook = {
    canGoBack: null,
    emit(event) {
      const payload: PredictiveBackEvent = { progress: 0, ...event };
      for (const h of [...handlers]) h({ payload });
    },
  };
  target.__lfPredictiveBack = hook;
  const backend = createPredictiveBack(
    'tauri-android',
    async (_cmd, args) => {
      const payload = args?.payload as { canGoBack?: boolean } | undefined;
      if (typeof payload?.canGoBack === 'boolean') hook.canGoBack = payload.canGoBack;
    },
    async (_event, handler) => {
      handlers.add(handler);
      return () => void handlers.delete(handler);
    },
  );
  if (!backend) throw new Error('the Android backend is always there for the Android host kind');
  return backend;
}
