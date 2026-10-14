// Tests for the launcher's Back.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type {
  PredictiveBackBackend,
  PredictiveBackHandlers,
} from '@lieutenant-fizz/engine/predictive-back';
import { createLauncherBack } from './back';
import { stopsOf } from './catalog';
import { hasBack, initialState, reduce } from './state';

function fakeBackend() {
  const log: string[] = [];
  let handlers: PredictiveBackHandlers | undefined;
  const backend: PredictiveBackBackend = {
    setCanGoBack: async (can) => void log.push(`can:${can}`),
    onGesture: async (h) => {
      handlers = h;
      return () => void log.push('stopped');
    },
  };
  return { backend, log, gesture: () => handlers?.invoked() };
}

describe('Back on the launcher', () => {
  it('has somewhere to go on About and nowhere on the home screen', () => {
    const home = initialState(stopsOf({ episodes: [] }), false);
    expect(hasBack(home)).toBe(false);
    expect(hasBack(reduce(home, { type: 'activate', row: 'about' }).state)).toBe(true);
  });

  it('tells the system only when the answer changes, and hands the gesture to the launcher', async () => {
    const { backend, log, gesture } = fakeBackend();
    let backs = 0;
    const back = await createLauncherBack({ backend, onBack: () => void backs++ });
    back.sync(false);
    back.sync(false);
    back.sync(true);
    back.sync(true);
    back.sync(false);
    expect(log).toEqual(['can:false', 'can:true', 'can:false']);
    gesture();
    expect(backs).toBe(1);
  });

  it('keeps the browser history entry in step with the screen', async () => {
    const wants: boolean[] = [];
    const back = await createLauncherBack({
      guard: { set: (w) => void wants.push(w) },
      onBack: () => {},
    });
    back.sync(true);
    back.sync(false);
    expect(wants).toEqual([true, false]);
  });

  it('hands Back to the system for good when it releases, and ignores later answers', async () => {
    const { backend, log } = fakeBackend();
    const back = await createLauncherBack({ backend, onBack: () => {} });
    back.sync(true);
    await back.release();
    back.sync(true);
    expect(log).toEqual(['can:true', 'can:false']);
    await back.release();
    expect(log).toEqual(['can:true', 'can:false']);
    back.dispose();
    expect(log.at(-1)).toBe('stopped');
  });

  it('works with nothing to talk to (the desktop app)', async () => {
    const back = await createLauncherBack({ onBack: () => {} });
    back.sync(true);
    await back.release();
    back.dispose();
  });
});
