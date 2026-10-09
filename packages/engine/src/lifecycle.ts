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
