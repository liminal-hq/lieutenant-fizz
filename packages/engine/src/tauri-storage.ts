// The Tauri app's storage: every key preloaded from a store file, written back in the background.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { FlushableStorage, StorageBackend } from './storage';

/** The store file inside the app's data directory. */
export const STORE_FILE = 'lf-data.json';

/** How long writes are gathered before the file is saved. */
export const SAVE_DELAY_MS = 250;

/** The command in the app's Rust that applies a batch to the store file and saves it. */
export const WRITE_COMMAND = 'write_store';

/**
 * What the adapter needs from the store file. Tests pass a fake. `write` applies a whole batch (a null value
 * removes the key) and saves, as one call, so it does not rely on the page staying alive between steps.
 */
export interface StoreFile {
  entries(): Promise<[string, unknown][]>;
  write(batch: [string, string | null][]): Promise<void>;
}

/** The part of `document` that says the page went to the background. */
export interface HideDoc {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/** The part of `window` that says the page is going away. */
export interface HideWin {
  addEventListener(type: 'pagehide', fn: () => void): void;
  removeEventListener(type: 'pagehide', fn: () => void): void;
}

export interface TauriStorageOptions {
  /** Opens the store file. */
  load: () => Promise<StoreFile>;
  doc?: HideDoc;
  win?: HideWin;
  /** Told about the first failure to write, once. Defaults to `console.warn`. */
  log?: (message: string, error: unknown) => void;
  /** How long writes are gathered before saving. */
  delayMs?: number;
}

/**
 * The store as the plugin gives it for reading (`lf-data.json`, no automatic saving), with writes sent to the
 * app's own `write_store` command: one native call that sets, removes and saves, so a page that Android
 * suspends right after the call still has its batch written.
 */
async function loadPluginStore(): Promise<StoreFile> {
  const { load } = await import('@tauri-apps/plugin-store');
  const { invoke } = await import('@tauri-apps/api/core');
  const store = await load(STORE_FILE, { defaults: {}, autoSave: false });
  return {
    entries: () => store.entries(),
    write: (batch) => invoke<void>(WRITE_COMMAND, { batch }),
  };
}

/**
 * Opens the store file and reads every key into memory first, so `getItem` stays synchronous. Writes land in
 * memory at once and reach the file in the background, gathered into one save; they are flushed when the page
 * is hidden or going away, as Android can end an app in the background. If the file fails, the game goes on
 * from memory and the failure is logged once.
 */
export async function openTauriStorage(options: TauriStorageOptions): Promise<FlushableStorage> {
  const file = await options.load();
  const map = new Map<string, string>();
  for (const [key, value] of await file.entries()) {
    if (typeof value === 'string') map.set(key, value);
  }

  const log = options.log ?? ((m, e) => console.warn(m, e));
  const delay = options.delayMs ?? SAVE_DELAY_MS;
  /** Keys changed since the last save: the new text, or null for a removal. */
  let pending = new Map<string, string | null>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();
  let logged = false;

  const write = async (batch: Map<string, string | null>): Promise<boolean> => {
    try {
      await file.write([...batch]);
      return true;
    } catch (error) {
      // Keep what did not reach the file for the next flush, unless a newer write has replaced it.
      for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
      if (!logged) {
        logged = true;
        log('Saving to the app store failed; carrying on from memory', error);
      }
      return false;
    }
  };

  const flush = (): Promise<boolean> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const result = chain.then((): boolean | Promise<boolean> => {
      if (pending.size === 0) return true;
      const batch = pending;
      pending = new Map();
      return write(batch);
    });
    chain = result.then(() => undefined);
    return result;
  };

  const queue = (key: string, value: string | null): void => {
    pending.set(key, value);
    timer ??= setTimeout(() => void flush(), delay);
  };

  const onVisibility = (): void => {
    if (options.doc?.visibilityState === 'hidden') void flush();
  };
  const onPageHide = (): void => void flush();
  options.doc?.addEventListener('visibilitychange', onVisibility);
  options.win?.addEventListener('pagehide', onPageHide);

  return {
    kind: 'tauri',
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      const text = String(value);
      map.set(key, text);
      queue(key, text);
    },
    removeItem: (key) => {
      if (!map.delete(key)) return;
      queue(key, null);
    },
    keys: () => [...map.keys()],
    flush,
  };
}

/** The part of `window` that says the page runs inside the Tauri app. */
export interface TauriHost extends Partial<HideWin> {
  readonly __TAURI_INTERNALS__?: unknown;
}

/**
 * The app's store as a backend. It is only there when the page runs inside Tauri (`__TAURI_INTERNALS__`),
 * so the web build never loads the plugin.
 */
export function tauriStorageBackend(
  host: TauriHost | undefined = typeof window === 'undefined' ? undefined : window,
  doc: HideDoc | undefined = typeof document === 'undefined' ? undefined : document,
  load: () => Promise<StoreFile> = loadPluginStore,
): StorageBackend {
  return {
    kind: 'tauri',
    open: () => {
      if (!host || !host.__TAURI_INTERNALS__) return null;
      return openTauriStorage({
        load,
        ...(doc ? { doc } : {}),
        ...(host.addEventListener && host.removeEventListener ? { win: host as HideWin } : {}),
      });
    },
  };
}
