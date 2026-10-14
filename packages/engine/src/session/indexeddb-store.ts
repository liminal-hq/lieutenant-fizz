// The web's session store: IndexedDB, asynchronous and large, with the log kept as one record per chunk.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SampleStore, SessionHeader, SessionInfo } from './store';

/** The database and its two object stores. */
export const DB_NAME = 'lf-samples';
const SESSIONS = 'sessions';
const CHUNKS = 'chunks';

interface SessionRecord extends SessionInfo {
  header: SessionHeader;
}

/** The parts of the browser the store uses, so tests can pass a fake. */
export interface IndexedDbHost {
  indexedDB: IDBFactory;
  /** `navigator.storage`, when the browser has it. */
  storage?: { persist?: () => Promise<boolean> };
}

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

/**
 * Opens the store, or resolves null where IndexedDB is missing or blocked (private windows in some browsers),
 * so the caller can fall back to the memory store.
 */
export async function openIndexedDbStore(
  host: IndexedDbHost | undefined,
): Promise<SampleStore | null> {
  if (!host?.indexedDB) return null;
  let db: IDBDatabase;
  try {
    const req = host.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore(SESSIONS, { keyPath: 'id' });
      // One record per chunk, keyed by session and position, so a session reads back in order.
      d.createObjectStore(CHUNKS);
    };
    db = await done(req);
  } catch {
    return null;
  }

  const session = async (id: string): Promise<SessionRecord> => {
    const rec = (await done(db.transaction(SESSIONS).objectStore(SESSIONS).get(id))) as
      SessionRecord | undefined;
    if (!rec) throw new Error(`no session ${id}`);
    return rec;
  };

  return {
    kind: 'indexeddb',
    async create(header) {
      const tx = db.transaction(SESSIONS, 'readwrite');
      const rec: SessionRecord = {
        id: header.id,
        startedAt: header.startedAt,
        bytes: 0,
        chunks: 0,
        ended: false,
        header,
      };
      tx.objectStore(SESSIONS).add(rec);
      await finished(tx);
    },
    async append(id, chunk) {
      const rec = await session(id);
      const tx = db.transaction([SESSIONS, CHUNKS], 'readwrite');
      tx.objectStore(CHUNKS).put(chunk, [id, rec.chunks]);
      tx.objectStore(SESSIONS).put({
        ...rec,
        chunks: rec.chunks + 1,
        bytes: rec.bytes + chunk.length,
      });
      await finished(tx);
    },
    async end(id) {
      const rec = await session(id);
      const tx = db.transaction(SESSIONS, 'readwrite');
      tx.objectStore(SESSIONS).put({ ...rec, ended: true });
      await finished(tx);
    },
    async list() {
      const all = (await done(
        db.transaction(SESSIONS).objectStore(SESSIONS).getAll(),
      )) as SessionRecord[];
      return all
        .map(({ id, startedAt, bytes, chunks, ended }) => ({ id, startedAt, bytes, chunks, ended }))
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
    },
    async read(id) {
      const rec = (await done(db.transaction(SESSIONS).objectStore(SESSIONS).get(id))) as
        SessionRecord | undefined;
      if (!rec) return null;
      const range = IDBKeyRange.bound([id, 0], [id, rec.chunks - 1]);
      const chunks = rec.chunks
        ? ((await done(db.transaction(CHUNKS).objectStore(CHUNKS).getAll(range))) as string[])
        : [];
      return { header: rec.header, chunks };
    },
    async remove(id) {
      const tx = db.transaction([SESSIONS, CHUNKS], 'readwrite');
      tx.objectStore(SESSIONS).delete(id);
      tx.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      await finished(tx);
    },
    async persist() {
      try {
        return (await host.storage?.persist?.()) ?? false;
      } catch {
        return false;
      }
    },
  };
}
