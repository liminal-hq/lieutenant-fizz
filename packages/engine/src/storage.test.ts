// Tests for the storage adapters and how createStorage picks between them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import {
  createStorage,
  durable,
  localStorageAdapter,
  localStorageBackend,
  memoryStorage,
  type KeyValueStorage,
  type StorageBackend,
} from './storage';

/** A `Storage` stand-in with the real enumeration API. */
function fakeLocal(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

/** A host whose `localStorage` getter throws, as a browser with storage blocked does. */
const blockedHost = {
  get localStorage(): Storage {
    throw new DOMException('denied', 'SecurityError');
  },
};

function backend(kind: StorageBackend['kind'], store: KeyValueStorage | null): StorageBackend {
  return { kind, open: () => store };
}

describe('memoryStorage', () => {
  it('reads, writes, removes and lists keys', () => {
    const m = memoryStorage({ 'lf-a': '1' });
    expect(m.kind).toBe('memory');
    expect(m.getItem('lf-a')).toBe('1');
    expect(m.getItem('lf-b')).toBeNull();
    m.setItem('lf-b', '2');
    expect(m.keys().sort()).toEqual(['lf-a', 'lf-b']);
    m.removeItem('lf-a');
    expect(m.getItem('lf-a')).toBeNull();
    expect(m.keys()).toEqual(['lf-b']);
  });

  it('does not share state between instances', () => {
    memoryStorage().setItem('lf-x', '1');
    expect(memoryStorage().getItem('lf-x')).toBeNull();
  });
});

describe('localStorageAdapter', () => {
  it('passes reads, writes and removals through and lists the keys', () => {
    const ls = fakeLocal({ 'lf-a': '1', other: '2' });
    const a = localStorageAdapter({ localStorage: ls });
    expect(a?.kind).toBe('local');
    expect(a?.getItem('lf-a')).toBe('1');
    a?.setItem('lf-b', '3');
    expect(ls.getItem('lf-b')).toBe('3');
    expect(a?.keys().sort()).toEqual(['lf-a', 'lf-b', 'other']);
    a?.removeItem('lf-a');
    expect(ls.getItem('lf-a')).toBeNull();
  });

  it('is null when reading localStorage throws', () => {
    expect(localStorageAdapter(blockedHost)).toBeNull();
  });

  it('is null with no window', () => {
    expect(localStorageAdapter(undefined)).toBeNull();
  });

  it('lets setItem throw so a full store reads as a failed save', () => {
    const ls = fakeLocal();
    ls.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const a = localStorageAdapter({ localStorage: ls });
    expect(() => a?.setItem('lf-a', '1')).toThrow();
  });

  it('answers null, nothing and no keys when the store fails on use', () => {
    const ls = fakeLocal();
    const boom = (): never => {
      throw new Error('boom');
    };
    ls.getItem = boom;
    ls.removeItem = boom;
    ls.key = boom;
    Object.defineProperty(ls, 'length', { get: () => 1 });
    const a = localStorageAdapter({ localStorage: ls });
    expect(a?.getItem('lf-a')).toBeNull();
    expect(() => a?.removeItem('lf-a')).not.toThrow();
    expect(a?.keys()).toEqual([]);
  });
});

describe('createStorage', () => {
  it('takes the first backend that opens', async () => {
    const tauri = memoryStorage();
    const local = memoryStorage();
    const open = vi.fn(() => local);
    const s = await createStorage({
      backends: [backend('tauri', tauri), { kind: 'local', open }],
    });
    expect(s).toBe(tauri);
    expect(open).not.toHaveBeenCalled();
  });

  it('skips a backend that is not there', async () => {
    const local = memoryStorage();
    const s = await createStorage({ backends: [backend('tauri', null), backend('local', local)] });
    expect(s).toBe(local);
  });

  it('skips a backend that throws or rejects, and says so', async () => {
    const local = memoryStorage();
    const onError = vi.fn();
    const s = await createStorage({
      backends: [
        {
          kind: 'tauri',
          open: () => {
            throw new Error('sync');
          },
        },
        { kind: 'tauri', open: () => Promise.reject(new Error('async')) },
        backend('local', local),
      ],
      onError,
    });
    expect(s).toBe(local);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0]?.[0]).toBe('tauri');
  });

  it('keeps going when the error callback itself throws', async () => {
    const local = memoryStorage();
    const onError = vi.fn(() => {
      throw new Error('logger broke');
    });
    const s = await createStorage({
      backends: [
        { kind: 'tauri', open: () => Promise.reject(new Error('async')) },
        backend('local', local),
      ],
      onError,
    });
    expect(s).toBe(local);
    const fallback = await createStorage({
      backends: [{ kind: 'tauri', open: () => Promise.reject(new Error('async')) }],
      onError,
    });
    expect(fallback.kind).toBe('memory');
  });

  it('falls back to memory when nothing opens', async () => {
    const s = await createStorage({ backends: [backend('tauri', null), backend('local', null)] });
    expect(s.kind).toBe('memory');
    s.setItem('lf-a', '1');
    expect(s.getItem('lf-a')).toBe('1');
  });

  it('falls back to memory when localStorage is blocked', async () => {
    const s = await createStorage({ backends: [localStorageBackend(blockedHost)] });
    expect(s.kind).toBe('memory');
  });

  it('uses localStorage when it works', async () => {
    const s = await createStorage({
      backends: [localStorageBackend({ localStorage: fakeLocal() })],
    });
    expect(s.kind).toBe('local');
  });

  it('never touches globals when backends are given', async () => {
    const s = await createStorage({ backends: [] });
    expect(s.kind).toBe('memory');
  });
});

describe('durable', () => {
  it('drops a memory store and keeps the others', () => {
    expect(durable(memoryStorage())).toBeNull();
    expect(durable(null)).toBeNull();
    const local = localStorageAdapter({ localStorage: fakeLocal() });
    expect(durable(local)).toBe(local);
  });
});
