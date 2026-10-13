// Starts a play sample: opens the store, builds the recorder and the listeners, and hands back what the game calls.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { listenToPage } from '@lieutenant-fizz/engine/session/listeners';
import { detectHostKind, hostEnvOf } from '@lieutenant-fizz/engine/host';
import { openIndexedDbStore } from '@lieutenant-fizz/engine/session/indexeddb-store';
import { SessionRecorder, type RecorderState } from '@lieutenant-fizz/engine/session/recorder';
import { openAppSqliteStore } from '@lieutenant-fizz/engine/session/sqlite-store';
import { memoryStore, type SampleStore } from '@lieutenant-fizz/engine/session/store';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import { PlaySample, type SampleView } from './play-sample';

/** What the game supplies to start a sample. */
export interface SampleHost {
  view: SampleView;
  /** The game's small storage, where a pointer to the active session is kept. */
  pointer: KeyValueStorage | null;
  /** The specs of the device and the game, read once at the start. */
  specs(): Record<string, unknown>;
  /** The simulation tick, for stamping events. */
  tick(): number;
  /** Names what is under a pointer ("ctl:jump", "menu:Options"), or null. */
  locate(x: number, y: number, target: unknown): string | null;
  /** Told when the recorder changes state (full, failed, warned). */
  onChange?(state: RecorderState, info: { bytes: number; warned: boolean }): void;
}

/** What the game holds while a sample is running. */
export interface SampleHandle {
  sample: PlaySample;
  recorder: SessionRecorder;
  store: SampleStore;
  /** Ends the session, writing what is waiting, and stops listening. */
  stop(): Promise<void>;
}

/** What the choice of store looks at and can open; the game passes the real ones and tests pass fakes. */
export interface StoreChoice {
  /** The apps keep a play sample in SQLite on disk. */
  app: boolean;
  openSqlite(): Promise<SampleStore | null>;
  openIndexedDb(): Promise<SampleStore | null>;
}

/**
 * The best store: SQLite on disk in the apps, IndexedDB in a browser, and memory if neither can be opened (the
 * session then lasts only as long as the page, and the review screen says so).
 */
export async function chooseStoreFrom(choice: StoreChoice): Promise<SampleStore> {
  if (choice.app) {
    const sqlite = await choice.openSqlite();
    if (sqlite) return sqlite;
  }
  return (await choice.openIndexedDb()) ?? memoryStore();
}

/** The store for this page. */
export function chooseStore(): Promise<SampleStore> {
  return chooseStoreFrom({
    app: detectHostKind(hostEnvOf()).startsWith('tauri'),
    openSqlite: () => openAppSqliteStore(),
    openIndexedDb: () =>
      openIndexedDbStore(
        typeof window === 'undefined'
          ? undefined
          : {
              indexedDB: window.indexedDB,
              ...(typeof navigator === 'undefined' ? {} : { storage: navigator.storage }),
            },
      ),
  });
}

/** Opens the store, starts the session and begins listening. Rejects if the store cannot create the session. */
export async function startPlaySample(
  host: SampleHost,
  store?: SampleStore,
): Promise<SampleHandle> {
  const chosen = store ?? (await chooseStore());
  void chosen.persist?.();
  const recorder = new SessionRecorder({
    store: chosen,
    pointer: host.pointer,
    now: () => performance.now(),
    wall: () => new Date(),
    tick: host.tick,
    newId: () => crypto.randomUUID().slice(0, 8),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h as number),
    ...(host.onChange ? { onChange: host.onChange } : {}),
  });
  await recorder.start(host.specs());
  const stopListening = listenToPage(recorder, {
    win: window,
    doc: document,
    locate: host.locate,
  });
  const sample = new PlaySample(recorder, host.view);
  return {
    sample,
    recorder,
    store: chosen,
    stop: async () => {
      stopListening();
      await recorder.stop();
    },
  };
}
