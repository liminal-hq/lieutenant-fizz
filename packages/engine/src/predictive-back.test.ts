// Tests for the predictive-back bindings, against a fake `invoke` and `listen`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import {
  createPredictiveBack,
  PREDICTIVE_BACK_EVENT,
  type PredictiveBackEvent,
  type PredictiveInvoke,
  type PredictiveListen,
} from './predictive-back';

/** A `listen` that keeps its handler so a test can fire events at it. */
function fakeListen() {
  let handler: ((event: { payload: PredictiveBackEvent }) => void) | undefined;
  const stop = vi.fn();
  const listen: PredictiveListen = async (event, h) => {
    expect(event).toBe(PREDICTIVE_BACK_EVENT);
    handler = h;
    return stop;
  };
  return {
    listen,
    stop,
    emit: (
      type: PredictiveBackEvent['type'],
      progress = 0,
      swipeEdge?: PredictiveBackEvent['swipeEdge'],
    ) => handler?.({ payload: { type, progress, ...(swipeEdge ? { swipeEdge } : {}) } }),
  };
}

describe('createPredictiveBack', () => {
  it('exists only on the Tauri Android app', () => {
    for (const kind of ['web', 'tauri-desktop', 'tauri-ios'] as const) {
      expect(createPredictiveBack(kind)).toBeUndefined();
    }
    expect(createPredictiveBack('tauri-android')).toBeDefined();
  });

  it('sends setCanGoBack under the plugin name with a payload key', async () => {
    const invoke = vi.fn<PredictiveInvoke>(async () => undefined);
    const backend = createPredictiveBack('tauri-android', invoke, fakeListen().listen)!;
    await backend.setCanGoBack(true);
    await backend.setCanGoBack(false);
    expect(invoke).toHaveBeenNthCalledWith(1, 'plugin:predictive-back|set_can_go_back', {
      payload: { canGoBack: true },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'plugin:predictive-back|set_can_go_back', {
      payload: { canGoBack: false },
    });
  });

  it('swallows a failed setCanGoBack', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke: PredictiveInvoke = () => Promise.reject(new Error('no plugin'));
    const backend = createPredictiveBack('tauri-android', invoke, fakeListen().listen)!;
    await expect(backend.setCanGoBack(true)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('passes each frame of the gesture to its handler, in order, with the edge when there is one', async () => {
    const fake = fakeListen();
    const backend = createPredictiveBack('tauri-android', async () => undefined, fake.listen)!;
    const calls: string[] = [];
    const stop = await backend.onGesture({
      started: (edge) => calls.push(`started ${edge}`),
      progress: (p, edge) => calls.push(`progress ${p} ${edge}`),
      cancelled: () => calls.push('cancelled'),
      invoked: () => calls.push('invoked'),
    });
    fake.emit('started', 0, 'right');
    fake.emit('progress', 0.5, 'right');
    fake.emit('progress', 0.75);
    fake.emit('cancelled');
    fake.emit('started', 0, 'left');
    fake.emit('invoked', 1);
    expect(calls).toEqual([
      'started right',
      'progress 0.5 right',
      'progress 0.75 undefined',
      'cancelled',
      'started left',
      'invoked',
    ]);
    stop();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('needs only an invoked handler, and ignores an edge it does not know', async () => {
    const fake = fakeListen();
    const backend = createPredictiveBack('tauri-android', async () => undefined, fake.listen)!;
    const invoked = vi.fn();
    await backend.onGesture({ invoked });
    fake.emit('started', 0);
    fake.emit('progress', 0.5);
    fake.emit('cancelled');
    expect(invoked).not.toHaveBeenCalled();
    fake.emit('invoked', 1);
    expect(invoked).toHaveBeenCalledTimes(1);
    const got = vi.fn();
    await backend.onGesture({ invoked, started: got });
    fake.emit('started', 0, 'up' as never);
    expect(got).toHaveBeenCalledWith(undefined);
  });

  it('swallows a failed listen and hands back a stop that does nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listen: PredictiveListen = () => Promise.reject(new Error('no events'));
    const backend = createPredictiveBack('tauri-android', async () => undefined, listen)!;
    const stop = await backend.onGesture({ invoked: () => {} });
    expect(() => stop()).not.toThrow();
    warn.mockRestore();
  });
});
