// Where a play session is kept while it is recorded: an append-only log of chunks, behind one small interface.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What is known about a stored session without reading its log. */
export interface SessionInfo {
  /** A random id, used as the key; it carries no meaning. */
  id: string;
  /** When the session started, as an ISO 8601 string with its time zone offset. */
  startedAt: string;
  /** The characters of every chunk written so far, a close measure of the size on disk for JSON text. */
  bytes: number;
  /** How many chunks have been written. */
  chunks: number;
  /** False while the session is open: one found at launch was cut short by a crash or a closed app. */
  ended: boolean;
}

/** The first thing stored for a session: the specs of the device and the game, and when it began. */
export interface SessionHeader {
  v: 1;
  id: string;
  startedAt: string;
  specs: Record<string, unknown>;
}

/**
 * Keeps sessions. A chunk is a block of newline-terminated JSON events; the store never looks inside one.
 * Appends are durable once their promise resolves, which is what makes a crash lose at most the unflushed
 * tail. No method sends anything anywhere.
 */
export interface SampleStore {
  readonly kind: 'indexeddb' | 'sqlite' | 'memory';
  /** Starts a session. Rejects if the id exists. */
  create(header: SessionHeader): Promise<void>;
  /** Adds a chunk to the end of a session. */
  append(id: string, chunk: string): Promise<void>;
  /** Marks a session finished, so it is no longer offered as unfinished. */
  end(id: string): Promise<void>;
  /** Every stored session, oldest first. */
  list(): Promise<SessionInfo[]>;
  /** A session's header and its chunks in order, or null when there is no such session. */
  read(id: string): Promise<{ header: SessionHeader; chunks: string[] } | null>;
  /** Forgets a session and its log. Resolves even if there is nothing to forget. */
  remove(id: string): Promise<void>;
  /** Asks that stored sessions are not cleared when space is short; resolves whether it was granted. */
  persist?(): Promise<boolean>;
}

/** A store that lives as long as the page: the fallback when nothing durable is available, and for tests. */
export function memoryStore(): SampleStore {
  interface Entry {
    header: SessionHeader;
    chunks: string[];
    ended: boolean;
  }
  const sessions = new Map<string, Entry>();
  const info = (e: Entry): SessionInfo => ({
    id: e.header.id,
    startedAt: e.header.startedAt,
    bytes: e.chunks.reduce((n, c) => n + c.length, 0),
    chunks: e.chunks.length,
    ended: e.ended,
  });
  const need = (id: string): Entry => {
    const e = sessions.get(id);
    if (!e) throw new Error(`no session ${id}`);
    return e;
  };
  return {
    kind: 'memory',
    create: async (header) => {
      if (sessions.has(header.id)) throw new Error(`session ${header.id} exists`);
      sessions.set(header.id, { header, chunks: [], ended: false });
    },
    append: async (id, chunk) => {
      need(id).chunks.push(chunk);
    },
    end: async (id) => {
      need(id).ended = true;
    },
    list: async () =>
      [...sessions.values()]
        .map(info)
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0)),
    read: async (id) => {
      const e = sessions.get(id);
      return e ? { header: e.header, chunks: [...e.chunks] } : null;
    },
    remove: async (id) => {
      sessions.delete(id);
    },
  };
}
