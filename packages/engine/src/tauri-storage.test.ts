// Tests for the Tauri store adapter with a fake store file: preload, write-through, flush and failure.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from './storage';
import {
  openTauriStorage,
  SAVE_DELAY_MS,
  tauriStorageBackend,
  type HideDoc,
  type HideWin,
  type StoreFile,
} from './tauri-storage';

/** A store file in memory that records what reached it. */
function fakeFile(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const file = {
    data,
    saves: 0,
    fail: false,
    entries: async (): Promise<[string, unknown][]> => [...data.entries()],
    set: async (k: string, v: unknown): Promise<void> => {
      if (file.fail) throw new Error('disk full');
      data.set(k, v);
    },
    delete: async (k: string): Promise<boolean> => {
      if (file.fail) throw new Error('disk full');
      return data.delete(k);
    },
    save: async (): Promise<void> => {
      if (file.fail) throw new Error('disk full');
      file.saves++;
    },
  };
  return file satisfies StoreFile & Record<string, unknown>;
}

function fakeDoc() {
  const fns = new Set<() => void>();
  const doc: HideDoc & { visibilityState: string; fire(): void } = {
    visibilityState: 'visible',
    addEventListener: (_t, fn) => void fns.add(fn),
    removeEventListener: (_t, fn) => void fns.delete(fn),
    fire: () => fns.forEach((fn) => fn()),
  };
  return doc;
}

function fakeWin() {
  const fns = new Set<() => void>();
  const win: HideWin & { fire(): void } = {
    addEventListener: (_t, fn) => void fns.add(fn),
    removeEventListener: (_t, fn) => void fns.delete(fn),
    fire: () => fns.forEach((fn) => fn()),
  };
  return win;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('openTauriStorage', () => {
  it('preloads every string key so reads are synchronous', async () => {
    const file = fakeFile({ 'lf-a': '1', 'lf-b': '2', odd: 3 });
    const s = await openTauriStorage({ load: async () => file });
    expect(s.kind).toBe('tauri');
    expect(s.getItem('lf-a')).toBe('1');
    expect(s.getItem('lf-b')).toBe('2');
    expect(s.getItem('lf-c')).toBeNull();
    expect(s.getItem('odd')).toBeNull();
    expect(s.keys().sort()).toEqual(['lf-a', 'lf-b']);
  });

  it('starts empty from an empty store', async () => {
    const s = await openTauriStorage({ load: async () => fakeFile() });
    expect(s.keys()).toEqual([]);
  });

  it('reads its own writes at once and writes through after the delay, in one save', async () => {
    const file = fakeFile();
    const s = await openTauriStorage({ load: async () => file });
    s.setItem('lf-a', '1');
    s.setItem('lf-a', '2');
    s.setItem('lf-b', '3');
    expect(s.getItem('lf-a')).toBe('2');
    expect(file.data.size).toBe(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(Object.fromEntries(file.data)).toEqual({ 'lf-a': '2', 'lf-b': '3' });
    expect(file.saves).toBe(1);
  });

  it('removes a key from memory and from the file', async () => {
    const file = fakeFile({ 'lf-a': '1' });
    const s = await openTauriStorage({ load: async () => file });
    s.removeItem('lf-a');
    expect(s.getItem('lf-a')).toBeNull();
    expect(s.keys()).toEqual([]);
    await s.flush();
    expect(file.data.has('lf-a')).toBe(false);
  });

  it('does not write for a key that was never there', async () => {
    const file = fakeFile();
    const s = await openTauriStorage({ load: async () => file });
    s.removeItem('lf-none');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(file.saves).toBe(0);
  });

  it('flushes at once when the page is hidden, not when it is shown', async () => {
    const file = fakeFile();
    const doc = fakeDoc();
    const s = await openTauriStorage({ load: async () => file, doc });
    s.setItem('lf-a', '1');
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(file.data.size).toBe(0);
    doc.visibilityState = 'hidden';
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(file.data.get('lf-a')).toBe('1');
  });

  it('flushes on pagehide', async () => {
    const file = fakeFile();
    const win = fakeWin();
    const s = await openTauriStorage({ load: async () => file, win });
    s.setItem('lf-a', '1');
    win.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(file.data.get('lf-a')).toBe('1');
  });

  it('keeps working from memory when the file fails, and logs once', async () => {
    const file = fakeFile();
    file.fail = true;
    const log = vi.fn();
    const s = await openTauriStorage({ load: async () => file, log });
    s.setItem('lf-a', '1');
    await s.flush();
    s.setItem('lf-b', '2');
    await s.flush();
    expect(s.getItem('lf-a')).toBe('1');
    expect(s.getItem('lf-b')).toBe('2');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('reports whether the flush reached the file', async () => {
    const file = fakeFile();
    file.fail = true;
    const s = await openTauriStorage({ load: async () => file, log: () => {} });
    s.setItem('lf-a', '1');
    expect(await s.flush()).toBe(false);
    expect(file.data.has('lf-a')).toBe(false);
    file.fail = false;
    expect(await s.flush()).toBe(true);
    expect(file.data.get('lf-a')).toBe('1');
    expect(await s.flush()).toBe(true);
  });

  it('retries what failed on the next flush', async () => {
    const file = fakeFile();
    file.fail = true;
    const s = await openTauriStorage({ load: async () => file, log: () => {} });
    s.setItem('lf-a', '1');
    await s.flush();
    file.fail = false;
    await s.flush();
    expect(file.data.get('lf-a')).toBe('1');
  });

  it('does not let a failed older write overwrite a newer one', async () => {
    const file = fakeFile();
    file.fail = true;
    const s = await openTauriStorage({ load: async () => file, log: () => {} });
    s.setItem('lf-a', 'old');
    const first = s.flush();
    s.setItem('lf-a', 'new');
    await first;
    file.fail = false;
    await s.flush();
    expect(file.data.get('lf-a')).toBe('new');
  });
});

describe('tauriStorageBackend', () => {
  it('is not there outside the app, and never loads the store', async () => {
    const load = vi.fn(async () => fakeFile());
    const b = tauriStorageBackend({}, undefined, load);
    expect(await b.open()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('opens inside the app', async () => {
    const b = tauriStorageBackend({ __TAURI_INTERNALS__: {} }, undefined, async () =>
      fakeFile({ 'lf-a': '1' }),
    );
    const s = await b.open();
    expect(s?.kind).toBe('tauri');
    expect(s?.getItem('lf-a')).toBe('1');
  });

  it('lets createStorage fall through to the next backend when the store will not load', async () => {
    const onError = vi.fn();
    const next = { kind: 'local' as const, open: () => ({ ...fakeStub() }) };
    const s = await createStorage({
      backends: [
        tauriStorageBackend({ __TAURI_INTERNALS__: {} }, undefined, () =>
          Promise.reject(new Error('no plugin')),
        ),
        next,
      ],
      onError,
    });
    expect(s.kind).toBe('local');
    expect(onError).toHaveBeenCalledWith('tauri', expect.any(Error));
  });
});

function fakeStub() {
  return {
    kind: 'local' as const,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    keys: () => [],
  };
}
