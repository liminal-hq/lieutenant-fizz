// Tests for the fullscreen and orientation-lock request.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  enterFullscreen,
  exitFullscreen,
  noKeepAwake,
  webWakeLock,
  type DocLike,
  type OrientationLike,
  type SentinelLike,
  type WakeDocLike,
  type WakeNavLike,
} from './lifecycle';

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

/** A sentinel the test can release the way the browser does. */
function sentinel() {
  const listeners: (() => void)[] = [];
  const s: SentinelLike & { released: number; fire(): void } = {
    released: 0,
    release: () => {
      s.released++;
      return Promise.resolve();
    },
    addEventListener: (_t, fn) => {
      listeners.push(fn);
    },
    fire: () => {
      for (const fn of listeners) fn();
    },
  };
  return s;
}

/** A wake lock whose requests the test settles by hand, and a document whose visibility it flips. */
function wakeFakes() {
  const pending: {
    resolve: (s: ReturnType<typeof sentinel>) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const nav: WakeNavLike = {
    wakeLock: {
      request: () =>
        new Promise<SentinelLike>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    },
  };
  const listeners = new Set<() => void>();
  const doc: WakeDocLike & { visibilityState: string } = {
    visibilityState: 'visible',
    addEventListener: (_t, fn) => {
      listeners.add(fn);
    },
    removeEventListener: (_t, fn) => {
      listeners.delete(fn);
    },
  };
  const setVisible = (visible: boolean): void => {
    doc.visibilityState = visible ? 'visible' : 'hidden';
    for (const fn of [...listeners]) fn();
  };
  return { nav, doc, pending, listeners, setVisible };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('webWakeLock', () => {
  it('requests on set(true) and holds the sentinel', async () => {
    const { nav, doc, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    expect(wl.kind).toBe('web');
    wl.set(true);
    expect(pending).toHaveLength(1);
    const s = sentinel();
    pending[0]?.resolve(s);
    await flush();
    expect(wl.debug).toEqual({ held: true, requests: 1, failures: 0, lastError: null });
    wl.set(false);
    expect(s.released).toBe(1);
    expect(wl.debug.held).toBe(false);
  });

  it('keeps one request in flight however often it is asked', () => {
    const { nav, doc, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    wl.set(true);
    wl.set(true);
    expect(pending).toHaveLength(1);
  });

  it('releases as soon as a request resolves after the ask was withdrawn', async () => {
    const { nav, doc, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    wl.set(false);
    const s = sentinel();
    pending[0]?.resolve(s);
    await flush();
    expect(s.released).toBe(1);
    expect(wl.debug.held).toBe(false);
    expect(pending).toHaveLength(1);
  });

  it('keeps the lock when the ask is raised again before the request resolves', async () => {
    const { nav, doc, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    wl.set(false);
    wl.set(true);
    const s = sentinel();
    pending[0]?.resolve(s);
    await flush();
    expect(s.released).toBe(0);
    expect(wl.debug.held).toBe(true);
    expect(pending).toHaveLength(1);
  });

  it('clears the sentinel on a release event and asks again when the page returns', async () => {
    const { nav, doc, pending, setVisible } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    const first = sentinel();
    pending[0]?.resolve(first);
    await flush();
    setVisible(false);
    first.fire();
    expect(wl.debug.held).toBe(false);
    expect(pending).toHaveLength(1);
    setVisible(true);
    expect(pending).toHaveLength(2);
    const second = sentinel();
    pending[1]?.resolve(second);
    await flush();
    expect(wl.debug).toMatchObject({ held: true, requests: 2 });
  });

  it('does not ask again on returning when the ask was withdrawn meanwhile', async () => {
    const { nav, doc, pending, setVisible } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    const first = sentinel();
    pending[0]?.resolve(first);
    await flush();
    setVisible(false);
    first.fire();
    wl.set(false);
    setVisible(true);
    expect(pending).toHaveLength(1);
  });

  it('waits to ask while hidden and asks on becoming visible', () => {
    const { nav, doc, pending, setVisible } = wakeFakes();
    doc.visibilityState = 'hidden';
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    expect(pending).toHaveLength(0);
    setVisible(true);
    expect(pending).toHaveLength(1);
  });

  it('does not retry after a refusal until the next time it is asked', async () => {
    const { nav, doc, pending, setVisible } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    pending[0]?.reject(Object.assign(new Error('battery'), { name: 'NotAllowedError' }));
    await flush();
    expect(wl.debug).toEqual({
      held: false,
      requests: 1,
      failures: 1,
      lastError: 'NotAllowedError',
    });
    wl.set(true);
    setVisible(false);
    setVisible(true);
    expect(pending).toHaveLength(1);
    wl.set(false);
    wl.set(true);
    expect(pending).toHaveLength(2);
  });

  it('survives a request that throws or a release that fails', async () => {
    const { doc } = wakeFakes();
    const throwing = webWakeLock(
      {
        wakeLock: {
          request: () => {
            throw new Error('nope');
          },
        },
      },
      doc,
    );
    expect(() => throwing.set(true)).not.toThrow();
    expect(throwing.debug).toMatchObject({ requests: 1, failures: 1, lastError: 'Error' });
    const { nav, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    const s = sentinel();
    s.release = () => Promise.reject(new Error('gone'));
    pending[0]?.resolve(s);
    await flush();
    expect(() => wl.set(false)).not.toThrow();
  });

  it('releases and stops listening on dispose', async () => {
    const { nav, doc, pending, listeners } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    const s = sentinel();
    pending[0]?.resolve(s);
    await flush();
    expect(listeners.size).toBe(1);
    wl.dispose();
    expect(s.released).toBe(1);
    expect(listeners.size).toBe(0);
    wl.set(true);
    expect(pending).toHaveLength(1);
  });

  it('releases a request that resolves after dispose', async () => {
    const { nav, doc, pending } = wakeFakes();
    const wl = webWakeLock(nav, doc);
    wl.set(true);
    wl.dispose();
    const s = sentinel();
    pending[0]?.resolve(s);
    await flush();
    expect(s.released).toBe(1);
  });

  it('falls back to nothing without a wake lock', () => {
    const { doc } = wakeFakes();
    expect(webWakeLock({}, doc)).toBe(noKeepAwake);
    expect(noKeepAwake.kind).toBe('none');
    expect(() => {
      noKeepAwake.set(true);
      noKeepAwake.dispose();
    }).not.toThrow();
  });
});

describe('exitFullscreen', () => {
  it('calls exitFullscreen at once when an element is fullscreen', async () => {
    const log: string[] = [];
    const doc = {
      fullscreenElement: {} as Element,
      exitFullscreen: (): Promise<void> => {
        log.push('exit');
        return Promise.resolve();
      },
    };
    const done = exitFullscreen(doc);
    expect(log).toEqual(['exit']);
    expect(await done).toBe('ok');
  });

  it('does nothing when the page is not fullscreen', async () => {
    let called = false;
    const doc = {
      fullscreenElement: null,
      exitFullscreen: (): Promise<void> => {
        called = true;
        return Promise.resolve();
      },
    };
    expect(await exitFullscreen(doc)).toBe('skipped');
    expect(called).toBe(false);
  });

  it('reports a missing, throwing or rejecting exit without throwing', async () => {
    const el = {} as Element;
    expect(await exitFullscreen({ fullscreenElement: el })).toBe('unsupported');
    expect(
      await exitFullscreen({
        fullscreenElement: el,
        exitFullscreen: () => {
          throw new Error('no');
        },
      }),
    ).toBe('denied');
    expect(
      await exitFullscreen({
        fullscreenElement: el,
        exitFullscreen: () => Promise.reject(new Error('no')),
      }),
    ).toBe('denied');
  });
});
