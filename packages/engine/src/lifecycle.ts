// Asks the browser for fullscreen and the landscape lock, from a gesture, and never throws.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { GesturePlan } from './lifecycle-policy';

/** The part of `document` that fullscreen needs. */
export interface DocLike {
  documentElement: { requestFullscreen?: (options?: { navigationUI?: 'hide' }) => Promise<void> };
}

/** The part of `screen.orientation` that the lock needs. */
export interface OrientationLike {
  lock?: (orientation: 'landscape') => Promise<void>;
}

/** How each request went: asked and allowed, refused, not offered by the browser, or not asked. */
export interface FullscreenResult {
  fullscreen: 'ok' | 'denied' | 'unsupported' | 'skipped';
  lock: 'ok' | 'denied' | 'unsupported' | 'skipped';
}

/**
 * Requests fullscreen, then the landscape lock once fullscreen is in. Call it synchronously inside the
 * gesture: the request is made before any `await`, because the browser only allows it while the tap's
 * user activation lasts. When the page is already fullscreen (or installed) the plan has no fullscreen
 * step and only the lock is attempted. Every failure is reported in the result and swallowed.
 */
export async function enterFullscreen(
  doc: DocLike,
  orientation: OrientationLike | undefined,
  plan: GesturePlan,
): Promise<FullscreenResult> {
  const result: FullscreenResult = { fullscreen: 'skipped', lock: 'skipped' };
  let pending: Promise<void> | null = null;
  if (plan.fullscreen) {
    const request = doc.documentElement.requestFullscreen;
    if (typeof request !== 'function') {
      result.fullscreen = 'unsupported';
    } else {
      try {
        pending = Promise.resolve(request.call(doc.documentElement, { navigationUI: 'hide' }));
      } catch {
        result.fullscreen = 'denied';
      }
    }
  }
  // Without a fullscreen step the lock is tried at once, still inside the gesture.
  let lockStart: Promise<void> | null = null;
  const lockNow = (): Promise<void> | null => {
    if (!plan.lock) return null;
    const lock = orientation?.lock;
    if (typeof lock !== 'function') {
      result.lock = 'unsupported';
      return null;
    }
    try {
      return lock.call(orientation, 'landscape');
    } catch {
      result.lock = 'denied';
      return null;
    }
  };
  if (!plan.fullscreen) lockStart = lockNow();
  else if (pending) {
    try {
      await pending;
      result.fullscreen = 'ok';
      lockStart = lockNow();
    } catch {
      result.fullscreen = 'denied';
    }
  }
  if (lockStart) {
    try {
      await lockStart;
      result.lock = 'ok';
    } catch {
      result.lock = 'denied';
    }
  }
  return result;
}

/** The part of `document` that leaving fullscreen needs. */
export interface ExitDocLike {
  fullscreenElement: Element | null;
  exitFullscreen?: () => Promise<void>;
}

/**
 * Leaves fullscreen when the page is in it. The call is made before any `await`, so it can be used
 * inside a gesture. Reports `skipped` when nothing is fullscreen, `unsupported` when the browser has no
 * `exitFullscreen`, and `denied` when it throws or rejects; it never throws.
 */
export async function exitFullscreen(
  doc: ExitDocLike,
): Promise<'ok' | 'denied' | 'unsupported' | 'skipped'> {
  if (doc.fullscreenElement === null) return 'skipped';
  const exit = doc.exitFullscreen;
  if (typeof exit !== 'function') return 'unsupported';
  let pending: Promise<void>;
  try {
    pending = Promise.resolve(exit.call(doc));
  } catch {
    return 'denied';
  }
  try {
    await pending;
    return 'ok';
  } catch {
    return 'denied';
  }
}

/** What the screen wake lock has done, for trying it on a phone (`debugState.lifecycle.wake`). */
export interface WakeReport {
  /** A sentinel is held right now. */
  held: boolean;
  /** Requests made to the browser. */
  requests: number;
  /** Requests the browser refused. */
  failures: number;
  /** The name of the last refusal (for example `NotAllowedError`), or null. */
  lastError: string | null;
}

/** Something that keeps the display on while asked to: the web wake lock, a native flag, or nothing. */
export interface KeepAwakeBackend {
  readonly kind: 'web' | 'native' | 'none';
  /** Asks for the display to stay on (true) or be let go (false). Safe to repeat; never throws. */
  set(on: boolean): void;
  /** Lets go and stops listening. */
  dispose(): void;
  readonly debug: WakeReport;
}

/** The part of a wake lock sentinel that is used. */
export interface SentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/** The part of `navigator` that the wake lock needs. */
export interface WakeNavLike {
  wakeLock?: { request(type: 'screen'): Promise<SentinelLike> };
}

/** The part of `document` that the wake lock needs. */
export interface WakeDocLike {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

const NO_REPORT: WakeReport = Object.freeze({
  held: false,
  requests: 0,
  failures: 0,
  lastError: null,
});

/** Keeps nothing awake; used where there is no wake lock and in the app until a native backend is given. */
export const noKeepAwake: KeepAwakeBackend = {
  kind: 'none',
  set: () => {},
  dispose: () => {},
  debug: NO_REPORT,
};

function errorName(e: unknown): string {
  const name = (e as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name !== '' ? name : String(e);
}

/**
 * Holds the browser's screen wake lock while asked to. One request is in flight at a time; if the ask is
 * withdrawn before it resolves the lock is released as soon as it does. The browser drops the lock when
 * the page hides, so a return to visible asks again if the ask still stands. A refusal (for example
 * `NotAllowedError` under battery saver) is not retried until the next time the ask is raised. Never throws.
 */
export function webWakeLock(nav: WakeNavLike, doc: WakeDocLike): KeepAwakeBackend {
  const lock = nav.wakeLock;
  if (!lock) return noKeepAwake;
  let wanted = false;
  let sentinel: SentinelLike | null = null;
  let inFlight = false;
  let refused = false;
  let disposed = false;
  const report = { requests: 0, failures: 0, lastError: null as string | null };

  const drop = (s: SentinelLike): void => {
    try {
      s.release().catch(() => {});
    } catch {
      // A sentinel that cannot be released is already gone.
    }
  };

  const request = (): void => {
    inFlight = true;
    report.requests++;
    let pending: Promise<SentinelLike>;
    try {
      pending = lock.request('screen');
    } catch (e) {
      inFlight = false;
      refused = true;
      report.failures++;
      report.lastError = errorName(e);
      return;
    }
    pending.then(
      (s) => {
        inFlight = false;
        if (disposed || !wanted) {
          drop(s);
          return;
        }
        sentinel = s;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      },
      (e: unknown) => {
        inFlight = false;
        refused = true;
        report.failures++;
        report.lastError = errorName(e);
      },
    );
  };

  const settle = (): void => {
    if (disposed) return;
    if (!wanted) {
      if (sentinel) {
        const s = sentinel;
        sentinel = null;
        drop(s);
      }
      return;
    }
    if (sentinel || inFlight || refused || doc.visibilityState !== 'visible') return;
    request();
  };

  const onVisibility = (): void => settle();
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    kind: 'web',
    set(on: boolean): void {
      if (on && !wanted) refused = false;
      wanted = on;
      settle();
    },
    dispose(): void {
      wanted = false;
      settle();
      disposed = true;
      doc.removeEventListener('visibilitychange', onVisibility);
    },
    get debug(): WakeReport {
      return { held: sentinel !== null, ...report };
    },
  };
}
