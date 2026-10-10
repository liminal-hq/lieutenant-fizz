// What the game runs inside — a web page, or the Tauri app on a desktop, Android or iOS — and what only the app can do (quit).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Where the game runs. The `tauri-*` kinds are the native app; the web is an ordinary browser page. */
export type HostKind = 'web' | 'tauri-desktop' | 'tauri-android' | 'tauri-ios';

/**
 * What the host offers beyond the page. `quit` exists only on the desktop app: a web page cannot close its
 * own tab, and Android and iOS leave a game with the system's Back and Home.
 */
export interface HostBackend {
  readonly kind: HostKind;
  /** Closes the app. Defined only for `tauri-desktop`. Never rejects. */
  quit?(): Promise<void>;
}

/** What detection looks at. */
export interface HostEnv {
  /** The page runs inside Tauri: `__TAURI_INTERNALS__` is present, or `isTauri` is true. */
  tauri: boolean;
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `navigator.maxTouchPoints`; absent counts as 0. A Mac has none, while an iPad has several. */
  maxTouchPoints?: number;
}

/** Reads the environment from `window` and `navigator`; pass `null` for one that is missing (tests, workers). */
export function hostEnvOf(
  win: object | null = typeof window === 'undefined' ? null : window,
  nav: { userAgent?: string; maxTouchPoints?: number } | null = typeof navigator === 'undefined'
    ? null
    : navigator,
): HostEnv {
  return {
    tauri:
      !!win && ('__TAURI_INTERNALS__' in win || (win as { isTauri?: unknown }).isTauri === true),
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
  };
}

/**
 * Which host this is. Inside Tauri the user agent tells Android and iOS from a desktop; anything else is the web.
 * An iPad in desktop content mode reports a Macintosh user agent, so a Macintosh agent with a touch screen is iOS.
 */
export function detectHostKind(env: HostEnv): HostKind {
  if (!env.tauri) return 'web';
  if (/\bAndroid\b/i.test(env.userAgent)) return 'tauri-android';
  if (/\b(iPhone|iPad|iPod)\b/.test(env.userAgent)) return 'tauri-ios';
  if (/\bMacintosh\b/.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1) return 'tauri-ios';
  return 'tauri-desktop';
}

/** Asks the app to close. */
export type QuitCommand = () => Promise<void>;

/**
 * The `quit` command of the Tauri shell (`apps/player/src-tauri/src/lib.rs`). The Tauri API is loaded
 * only when it is called, so the web bundle never carries it.
 */
async function invokeQuit(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('quit');
}

/**
 * The host as a backend. Only the desktop app gets `quit`; the other hosts have the kind and nothing more.
 * `quit` swallows a failure, so a broken command leaves the game running rather than throwing in a handler.
 */
export function createHostBackend(
  env: HostEnv = hostEnvOf(),
  quit: QuitCommand = invokeQuit,
): HostBackend {
  const kind = detectHostKind(env);
  if (kind !== 'tauri-desktop') return { kind };
  return {
    kind,
    quit: async () => {
      try {
        await quit();
      } catch (error) {
        console.warn('Quitting the app failed', error);
      }
    },
  };
}
