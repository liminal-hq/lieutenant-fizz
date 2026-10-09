// What the shell asks of fullscreen — enter, leave, is it on, did it change, does the page see Esc — with the browser's version.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { createEscLock, type EscLock, type KeyboardLockLike } from './keyboard-lock';
import {
  enterFullscreen,
  exitFullscreen,
  type DocLike,
  type ExitDocLike,
  type FullscreenResult,
  type OrientationLike,
} from './lifecycle';
import type { GesturePlan } from './lifecycle-policy';

/** How leaving fullscreen went. */
export type ExitResult = 'ok' | 'denied' | 'unsupported' | 'skipped';

/**
 * Fullscreen as the shell sees it, so the Esc rules do not depend on where the game runs. The browser's
 * version is {@link webFullscreenBackend}; the Tauri app can inject its own (a native window's fullscreen,
 * where the OS does not take Esc, so `escapeCaptured` is true).
 */
export interface FullscreenBackend {
  readonly kind: 'web' | 'native' | 'none';
  /** The page is fullscreen right now. */
  isFullscreen(): boolean;
  /** Goes fullscreen (and takes the landscape lock) as the plan says. Call inside the gesture. Never throws. */
  enter(plan: GesturePlan): Promise<FullscreenResult>;
  /** Leaves fullscreen. Never throws. */
  exit(): Promise<ExitResult>;
  /**
   * Calls `fn` when fullscreen comes or goes, and when `escapeCaptured` changes. Handlers must be safe to
   * run more than once for the same state. Returns an unsubscribe function.
   */
  onChange(fn: () => void): () => void;
  /** Esc reaches the page while fullscreen (the browser's Keyboard Lock is held, or the window is native). */
  readonly escapeCaptured: boolean;
  /** Lets go of everything and stops listening. */
  dispose(): void;
}

/** The part of `document` the web backend uses. */
export interface WebFullscreenDoc extends DocLike, ExitDocLike {
  addEventListener(type: 'fullscreenchange', listener: () => void): void;
  removeEventListener(type: 'fullscreenchange', listener: () => void): void;
}

/** What the web backend is made of. */
export interface WebFullscreenEnv {
  doc: WebFullscreenDoc;
  orientation: OrientationLike | undefined;
  /** `navigator.keyboard`, when the browser has it. */
  keyboard: KeyboardLockLike | undefined;
  /** The page is a secure context (Keyboard Lock is only offered to one). */
  secure: boolean;
  /** The device is touch-capable, where there is no Esc to keep. Read when fullscreen starts. */
  touch: () => boolean;
}

/**
 * The browser's fullscreen: `enterFullscreen`, `exitFullscreen` and `fullscreenchange`, plus Esc held with
 * the Keyboard Lock for as long as the page is fullscreen on a desktop. `escapeCaptured` is true only once
 * the browser has agreed to the lock, so a browser without it behaves as it always did. The lock follows
 * `fullscreenchange`, so it covers every way in and out (the button, `F`, the automatic request, a held Esc).
 */
export function webFullscreenBackend(env: WebFullscreenEnv): FullscreenBackend {
  const lock: EscLock = createEscLock({ keyboard: env.keyboard, secure: env.secure });
  const handlers = new Set<() => void>();
  const notify = (): void => {
    for (const h of [...handlers]) h();
  };
  const isFullscreen = (): boolean => env.doc.fullscreenElement !== null;
  const onFullscreenChange = (): void => {
    if (isFullscreen()) {
      void lock.engage(env.touch()).then(notify);
    } else {
      lock.release();
    }
    notify();
  };
  env.doc.addEventListener('fullscreenchange', onFullscreenChange);
  return {
    kind: 'web',
    isFullscreen,
    enter: (plan) => enterFullscreen(env.doc, env.orientation, plan),
    exit: () => exitFullscreen(env.doc),
    onChange(fn) {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },
    get escapeCaptured(): boolean {
      return lock.held && isFullscreen();
    },
    dispose(): void {
      env.doc.removeEventListener('fullscreenchange', onFullscreenChange);
      lock.release();
      handlers.clear();
    },
  };
}
