// Tests for the session stores: one set of rules, run against the memory store and the IndexedDB store.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openIndexedDbStore } from './indexeddb-store';
import { openSqliteStore, type SqlDb } from './sqlite-store';
import { memoryStore, type SampleStore, type SessionHeader } from './store';

const header = (id: string, startedAt = '2026-10-13T14:02:00-04:00'): SessionHeader => ({
  v: 1,
  id,
  startedAt,
  specs: { host: 'web' },
});

// Node's own SQLite, where this Node has it, so the real SQL runs against a real engine.
const nodeSqlite = await import('node:sqlite').catch(() => null);

/** A Node SQLite database in the shape of the Tauri SQL plugin's `Database`. */
function nodeDb(): SqlDb {
  const db = new nodeSqlite!.DatabaseSync(':memory:');
  return {
    execute: async (query, bindings = []) => ({
      rowsAffected: Number(db.prepare(query).run(...(bindings as never[])).changes),
    }),
    select: async <T>(query: string, bindings: unknown[] = []) =>
      db.prepare(query).all(...(bindings as never[])) as T[],
  };
}

const backends: [string, () => Promise<SampleStore>][] = [
  ['memory', async () => memoryStore()],
  [
    'indexeddb',
    async () => {
      // A new factory for each test, so one test's sessions never reach the next.
      const store = await openIndexedDbStore({ indexedDB: new IDBFactory() });
      if (!store) throw new Error('no store');
      return store;
    },
  ],
  ...(nodeSqlite
    ? [['sqlite', async () => openSqliteStore(nodeDb())] as [string, () => Promise<SampleStore>]]
    : []),
];

describe.each(backends)('the %s session store', (_name, open) => {
  it('starts empty', async () => {
    const s = await open();
    expect(await s.list()).toEqual([]);
    expect(await s.read('nope')).toBeNull();
  });

  it('keeps a session, its header and its chunks in order', async () => {
    const s = await open();
    await s.create(header('a'));
    await s.append('a', '{"e":"one"}\n');
    await s.append('a', '{"e":"two"}\n{"e":"three"}\n');
    const got = await s.read('a');
    expect(got?.header).toEqual(header('a'));
    expect(got?.chunks).toEqual(['{"e":"one"}\n', '{"e":"two"}\n{"e":"three"}\n']);
    const [info] = await s.list();
    expect(info).toEqual({
      id: 'a',
      startedAt: '2026-10-13T14:02:00-04:00',
      bytes: 12 + 26,
      chunks: 2,
      ended: false,
    });
  });

  it('keeps more than ten chunks in order, not in text order', async () => {
    const s = await open();
    await s.create(header('a'));
    for (let i = 0; i < 12; i += 1) await s.append('a', `${i}\n`);
    expect((await s.read('a'))?.chunks).toEqual(Array.from({ length: 12 }, (_, i) => `${i}\n`));
  });

  it('marks a session ended, and lists the oldest first', async () => {
    const s = await open();
    await s.create(header('late', '2026-10-13T16:00:00-04:00'));
    await s.create(header('early', '2026-10-13T09:00:00-04:00'));
    await s.end('early');
    const list = await s.list();
    expect(list.map((i) => [i.id, i.ended])).toEqual([
      ['early', true],
      ['late', false],
    ]);
  });

  it('keeps sessions apart, and removes one with its chunks', async () => {
    const s = await open();
    await s.create(header('a'));
    await s.create(header('b'));
    await s.append('a', 'A\n');
    await s.append('b', 'B\n');
    await s.remove('a');
    expect(await s.read('a')).toBeNull();
    expect((await s.read('b'))?.chunks).toEqual(['B\n']);
    await s.remove('a');
    expect((await s.list()).map((i) => i.id)).toEqual(['b']);
  });

  it('refuses a second session with the same id, and an append to none', async () => {
    const s = await open();
    await s.create(header('a'));
    await expect(s.create(header('a'))).rejects.toBeDefined();
    await expect(s.append('missing', 'x\n')).rejects.toBeDefined();
  });
});

describe('the IndexedDB store', () => {
  it('is null where there is no IndexedDB', async () => {
    expect(await openIndexedDbStore(undefined)).toBeNull();
    expect(await openIndexedDbStore({} as never)).toBeNull();
  });

  it('keeps a session across opening it again, as a reload would', async () => {
    const factory = new IDBFactory();
    const first = await openIndexedDbStore({ indexedDB: factory });
    await first!.create(header('a'));
    await first!.append('a', 'kept\n');
    const second = await openIndexedDbStore({ indexedDB: factory });
    const got = await second!.read('a');
    expect(got?.chunks).toEqual(['kept\n']);
    expect((await second!.list())[0]?.ended).toBe(false);
  });

  it('asks the browser to keep it, and says whether it was granted', async () => {
    const granted = await openIndexedDbStore({
      indexedDB: new IDBFactory(),
      storage: { persist: async () => true },
    });
    expect(await granted!.persist!()).toBe(true);
    const throwing = await openIndexedDbStore({
      indexedDB: new IDBFactory(),
      storage: {
        persist: async () => {
          throw new Error('no');
        },
      },
    });
    expect(await throwing!.persist!()).toBe(false);
    const none = await openIndexedDbStore({ indexedDB: new IDBFactory() });
    expect(await none!.persist!()).toBe(false);
  });
});

describe.skipIf(!nodeSqlite)('the SQLite store', () => {
  it('counts a session from its chunks, so a crash between two writes leaves nothing out of step', async () => {
    const db = nodeDb();
    const store = await openSqliteStore(db);
    await store.create(header('a'));
    await store.append('a', 'one\n');
    // A chunk that reached the disk with nothing else written after it.
    await db.execute("INSERT INTO chunks (session_id, n, data) VALUES ('a', 1, 'two\n')");
    const [info] = await store.list();
    expect(info).toMatchObject({ chunks: 2, bytes: 8 });
    expect((await store.read('a'))?.chunks).toEqual(['one\n', 'two\n']);
  });

  it('numbers chunks from zero with no gaps, even after another session’s chunks', async () => {
    const db = nodeDb();
    const store = await openSqliteStore(db);
    await store.create(header('a'));
    await store.create(header('b'));
    await store.append('a', 'a0\n');
    await store.append('b', 'b0\n');
    await store.append('a', 'a1\n');
    const rows = await db.select<{ session_id: string; n: number }>(
      'SELECT session_id, n FROM chunks ORDER BY session_id, n',
    );
    expect(rows).toEqual([
      { session_id: 'a', n: 0 },
      { session_id: 'a', n: 1 },
      { session_id: 'b', n: 0 },
    ]);
  });

  it('removes a session’s chunks with it, and leaves no chunk for a session that is gone', async () => {
    const db = nodeDb();
    const store = await openSqliteStore(db);
    await store.create(header('a'));
    await store.append('a', 'x\n');
    await store.remove('a');
    expect(await db.select('SELECT * FROM chunks')).toEqual([]);
    expect(await db.select('SELECT * FROM sessions')).toEqual([]);
  });

  it('keeps what is stored when opened again on the same database', async () => {
    const db = nodeDb();
    await (await openSqliteStore(db)).create(header('a'));
    const again = await openSqliteStore(db);
    expect((await again.list()).map((i) => i.id)).toEqual(['a']);
  });

  it('reports itself as sqlite, and keeps the header exactly', async () => {
    const store = await openSqliteStore(nodeDb());
    expect(store.kind).toBe('sqlite');
    await store.create({ ...header('a'), specs: { screen: [2400, 1080], note: 'é "quoted"' } });
    expect((await store.read('a'))?.header.specs).toEqual({
      screen: [2400, 1080],
      note: 'é "quoted"',
    });
  });
});
