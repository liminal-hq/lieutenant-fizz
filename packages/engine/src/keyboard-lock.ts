// Holds the Keyboard Lock on Esc while the page is fullscreen, so the page still gets the key.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The part of `navigator.keyboard` that the lock needs (Chromium only). */
export interface KeyboardLockLike {
  lock?: (keyCodes?: string[]) => Promise<void>;
  unlock?: () => void;
}

/** How asking for the lock went: held, refused, not offered here, or not asked (touch, insecure page). */
export type EscLockResult = 'ok' | 'denied' | 'unsupported' | 'skipped';

/** What the lock needs to know about the page. */
export interface EscLockEnv {
  /** `navigator.keyboard`, when the browser has it. */
  keyboard: KeyboardLockLike | undefined;
  /** The page is a secure context (the API is only offered to one). */
  secure: boolean;
}

/** A hold on Esc that comes with fullscreen and goes with it. */
export interface EscLock {
  /**
   * Asks for Esc. Call it once fullscreen is in; a repeat while held or asked is a no-op. Never throws.
   * `touch` skips it on a touch device, which has no Esc to keep.
   */
  engage(touch: boolean): Promise<EscLockResult>;
  /** Lets Esc go back to the browser. Safe when nothing is held, and when the request is still pending. */
  release(): void;
  /** Esc is held right now: the page sees the key in fullscreen. False until the browser has agreed. */
  readonly held: boolean;
}

/**
 * Wraps `navigator.keyboard.lock(['Escape'])` and `unlock()`. The lock is only believed once the browser
 * has resolved the request, so a page that was refused, or that is still waiting, behaves as if there were
 * no lock. A release that arrives before the answer undoes the lock as soon as it comes.
 */
export function createEscLock(env: EscLockEnv): EscLock {
  let wanted = false;
  let held = false;
  let pending: Promise<EscLockResult> | null = null;

  const unlock = (): void => {
    try {
      env.keyboard?.unlock?.();
    } catch {
      // A lock that cannot be undone was never held.
    }
  };

  return {
    engage(touch: boolean): Promise<EscLockResult> {
      if (touch || !env.secure) return Promise.resolve('skipped');
      const lock = env.keyboard?.lock;
      if (typeof lock !== 'function') return Promise.resolve('unsupported');
      wanted = true;
      if (held) return Promise.resolve('ok');
      if (pending) return pending;
      let request: Promise<void>;
      try {
        request = Promise.resolve(lock.call(env.keyboard, ['Escape']));
      } catch {
        wanted = false;
        return Promise.resolve('denied');
      }
      const done = request.then(
        (): EscLockResult => {
          pending = null;
          if (!wanted) {
            unlock();
            return 'skipped';
          }
          held = true;
          return 'ok';
        },
        (): EscLockResult => {
          pending = null;
          return 'denied';
        },
      );
      pending = done;
      return done;
    },
    release(): void {
      wanted = false;
      if (!held) return;
      held = false;
      unlock();
    },
    get held(): boolean {
      return held;
    },
  };
}
