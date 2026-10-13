// Tests for the session stores: one set of rules, run against the memory store and the IndexedDB store.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openIndexedDbStore } from './indexeddb-store';
import { memoryStore, type SampleStore, type SessionHeader } from './store';

const header = (id: string, startedAt = '2026-10-13T14:02:00-04:00'): SessionHeader => ({
  v: 1,
  id,
  startedAt,
  specs: { host: 'web' },
});

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
