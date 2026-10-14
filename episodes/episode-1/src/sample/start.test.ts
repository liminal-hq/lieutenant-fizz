// Tests for choosing where a play sample is kept.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { memoryStore, type SampleStore } from '@lieutenant-fizz/engine/session/store';
import { describe, expect, it } from 'vitest';
import { chooseStoreFrom } from './start';

const fake = (kind: SampleStore['kind']): SampleStore => ({ ...memoryStore(), kind });

describe('chooseStoreFrom', () => {
  it('uses SQLite in the apps', async () => {
    const store = await chooseStoreFrom({
      app: true,
      openSqlite: async () => fake('sqlite'),
      openIndexedDb: async () => fake('indexeddb'),
    });
    expect(store.kind).toBe('sqlite');
  });

  it('uses IndexedDB in a browser, and never tries SQLite there', async () => {
    let tried = false;
    const store = await chooseStoreFrom({
      app: false,
      openSqlite: async () => {
        tried = true;
        return fake('sqlite');
      },
      openIndexedDb: async () => fake('indexeddb'),
    });
    expect(store.kind).toBe('indexeddb');
    expect(tried).toBe(false);
  });

  it('falls back from SQLite to IndexedDB in an app, and to memory when neither opens', async () => {
    const viaIdb = await chooseStoreFrom({
      app: true,
      openSqlite: async () => null,
      openIndexedDb: async () => fake('indexeddb'),
    });
    expect(viaIdb.kind).toBe('indexeddb');
    const viaMemory = await chooseStoreFrom({
      app: true,
      openSqlite: async () => null,
      openIndexedDb: async () => null,
    });
    expect(viaMemory.kind).toBe('memory');
  });
});
