// Where the game keeps its saves and settings: one small synchronous interface, and the backend picked at boot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Where the data lives: the browser's `localStorage`, the Tauri app's store file, or this page load only. */
export type StorageKind = 'local' | 'tauri' | 'memory';

/**
 * The part of `Storage` the game uses, kept synchronous so saves and options read the way they always have.
 * Every key the game owns starts with `lf-`.
 */
export interface KeyValueStorage {
  readonly kind: StorageKind;
  /** The stored text, or null when there is none. */
  getItem(key: string): string | null;
  /** Stores text. May throw when the store is full or blocked, so callers report a failed save. */
  setItem(key: string, value: string): void;
  /** Forgets a key. Never throws. */
  removeItem(key: string): void;
  /** Every key held now. Never throws. */
  keys(): string[];
}

/** A store that can be written out; the Tauri backend writes to a file in the background. */
export interface FlushableStorage extends KeyValueStorage {
  /** Resolves when every write so far has reached the backing store. Never rejects. */
  flush(): Promise<void>;
}

/** A way of reaching storage, tried in order by {@link createStorage}. */
export interface StorageBackend {
  readonly kind: Exclude<StorageKind, 'memory'>;
  /** Opens the store, or returns null when this backend is not here (or is blocked). May throw. */
  open(): KeyValueStorage | null | Promise<KeyValueStorage | null>;
}

export interface CreateStorageOptions {
  /** The backends to try, first match wins. Defaults to {@link defaultBackends}. Tests inject their own. */
  backends?: readonly StorageBackend[];
  /** Told when a backend threw, before the next one is tried. */
  onError?: (kind: StorageBackend['kind'], error: unknown) => void;
}

/** A store that lives only as long as the page: the fallback when nothing durable is available. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {
    kind: 'memory',
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

/** The part of `window` the `localStorage` adapter reads. Reading `localStorage` itself can throw. */
export interface LocalStorageHost {
  readonly localStorage: Storage;
}

/** Wraps the browser's `localStorage`, or returns null when the browser blocks it. */
export function localStorageAdapter(
  host: LocalStorageHost | undefined = typeof window === 'undefined' ? undefined : window,
): KeyValueStorage | null {
  let ls: Storage;
  try {
    if (!host) return null;
    ls = host.localStorage;
    if (!ls) return null;
  } catch {
    return null;
  }
  return {
    kind: 'local',
    getItem: (key) => {
      try {
        return ls.getItem(key);
      } catch {
        return null;
      }
    },
    // Left to throw: a full or blocked store is how a failed save is noticed.
    setItem: (key, value) => ls.setItem(key, value),
    removeItem: (key) => {
      try {
        ls.removeItem(key);
      } catch {
        /* nothing to forget */
      }
    },
    keys: () => {
      try {
        const out: string[] = [];
        for (let i = 0; i < ls.length; i++) {
          const key = ls.key(i);
          if (key !== null) out.push(key);
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}

/** The browser's `localStorage` as a backend. */
export function localStorageBackend(host?: LocalStorageHost): StorageBackend {
  return { kind: 'local', open: () => localStorageAdapter(host) };
}

/** The backends the game tries at boot, in order. */
export function defaultBackends(): readonly StorageBackend[] {
  return [localStorageBackend()];
}

/**
 * Picks where the game reads and writes: the first backend that opens, else a store in memory. Never
 * rejects, so the game starts whatever the device allows.
 */
export async function createStorage(options: CreateStorageOptions = {}): Promise<KeyValueStorage> {
  for (const backend of options.backends ?? defaultBackends()) {
    try {
      const store = await backend.open();
      if (store) return store;
    } catch (error) {
      options.onError?.(backend.kind, error);
    }
  }
  return memoryStorage();
}

/** The store to save into, or null when it would not outlast the page (so the game reports no saving). */
export function durable(store: KeyValueStorage | null | undefined): KeyValueStorage | null {
  return store && store.kind !== 'memory' ? store : null;
}
