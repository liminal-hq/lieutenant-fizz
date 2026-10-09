// Tests for the fullscreen and orientation-lock request.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { enterFullscreen, type DocLike, type OrientationLike } from './lifecycle';

const BOTH = { fullscreen: true, lock: true };

/** Fakes that log the order of calls, with promises the test settles by hand. */
function fakes(opts: { rejectFs?: boolean; rejectLock?: boolean; noLock?: boolean } = {}) {
  const log: string[] = [];
  const doc: DocLike = {
    documentElement: {
      requestFullscreen: (o) => {
        log.push(`request:${o?.navigationUI}`);
        return opts.rejectFs ? Promise.reject(new Error('denied')) : Promise.resolve();
      },
    },
  };
  const orientation: OrientationLike = opts.noLock
    ? {}
    : {
        lock: (o) => {
          log.push(`lock:${o}`);
          return opts.rejectLock ? Promise.reject(new Error('nope')) : Promise.resolve();
        },
      };
  return { log, doc, orientation };
}

describe('enterFullscreen', () => {
  it('issues the request synchronously and locks only after it resolves', async () => {
    const { log, doc, orientation } = fakes();
    const done = enterFullscreen(doc, orientation, BOTH);
    expect(log).toEqual(['request:hide']);
    await Promise.resolve();
    await done;
    expect(log).toEqual(['request:hide', 'lock:landscape']);
    expect(await done).toEqual({ fullscreen: 'ok', lock: 'ok' });
  });

  it('reports a refusal as denied without throwing, and does not lock', async () => {
    const { log, doc, orientation } = fakes({ rejectFs: true });
    expect(await enterFullscreen(doc, orientation, BOTH)).toEqual({
      fullscreen: 'denied',
      lock: 'skipped',
    });
    expect(log).toEqual(['request:hide']);
  });

  it('reports a refused lock as denied', async () => {
    const { doc, orientation } = fakes({ rejectLock: true });
    expect(await enterFullscreen(doc, orientation, BOTH)).toEqual({
      fullscreen: 'ok',
      lock: 'denied',
    });
  });

  it('reports a missing lock as unsupported', async () => {
    const { doc, orientation } = fakes({ noLock: true });
    expect(await enterFullscreen(doc, orientation, BOTH)).toEqual({
      fullscreen: 'ok',
      lock: 'unsupported',
    });
    expect(await enterFullscreen(doc, undefined, BOTH)).toEqual({
      fullscreen: 'ok',
      lock: 'unsupported',
    });
  });

  it('reports a missing requestFullscreen as unsupported', async () => {
    const { orientation } = fakes();
    const r = await enterFullscreen({ documentElement: {} }, orientation, BOTH);
    expect(r).toEqual({ fullscreen: 'unsupported', lock: 'skipped' });
  });

  it('survives a request that throws, or one that returns no promise', async () => {
    const { orientation } = fakes();
    const throws: DocLike = {
      documentElement: {
        requestFullscreen: () => {
          throw new Error('boom');
        },
      },
    };
    expect((await enterFullscreen(throws, orientation, BOTH)).fullscreen).toBe('denied');
    const none = { documentElement: { requestFullscreen: () => undefined } } as unknown as DocLike;
    expect((await enterFullscreen(none, orientation, BOTH)).fullscreen).toBe('ok');
  });

  it('locks at once, with no request, when the plan has no fullscreen step', async () => {
    const { log, doc, orientation } = fakes();
    const done = enterFullscreen(doc, orientation, { fullscreen: false, lock: true });
    expect(log).toEqual(['lock:landscape']);
    expect(await done).toEqual({ fullscreen: 'skipped', lock: 'ok' });
  });

  it('does nothing for an empty plan', async () => {
    const { log, doc, orientation } = fakes();
    expect(await enterFullscreen(doc, orientation, { fullscreen: false, lock: false })).toEqual({
      fullscreen: 'skipped',
      lock: 'skipped',
    });
    expect(log).toEqual([]);
  });
});
