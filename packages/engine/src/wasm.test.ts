// Tests the WASM loader and the linear-memory view cache.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWasm, MemoryViews } from './wasm';

/** A module with no imports that exports one 1-page memory named "memory". */
const WITH_MEMORY = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01, 0x07, 0x0a, 0x01,
  0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
]);
/** The smallest valid module: no exports at all. */
const EMPTY = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

afterEach(() => vi.unstubAllGlobals());

describe('loadWasm', () => {
  it('instantiates bytes and returns the exported memory', async () => {
    const mod = await loadWasm<{ memory: WebAssembly.Memory }>(WITH_MEMORY);
    expect(mod.memory).toBeInstanceOf(WebAssembly.Memory);
    expect(mod.exports.memory).toBe(mod.memory);
    expect(mod.memory.buffer.byteLength).toBe(65536);
  });

  it('rejects a module that does not export its memory', async () => {
    await expect(loadWasm(EMPTY)).rejects.toThrow('does not export its memory');
  });

  it('fetches a URL and instantiates it, with or without the wasm content type', async () => {
    for (const type of ['application/wasm', 'application/octet-stream']) {
      const fetchMock = vi.fn(
        async () => new Response(WITH_MEMORY, { headers: { 'content-type': type } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const mod = await loadWasm<unknown>('/sim.wasm');
      expect(fetchMock).toHaveBeenCalledWith('/sim.wasm');
      expect(mod.memory).toBeInstanceOf(WebAssembly.Memory);
    }
  });

  it('reports the URL and status when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    await expect(loadWasm('/missing.wasm')).rejects.toThrow('Failed to fetch /missing.wasm: 404');
  });
});

describe('MemoryViews', () => {
  it('returns a float view at the pointer and caches it per key', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    new Float32Array(memory.buffer, 16, 2).set([1.5, -2]);
    const views = new MemoryViews(memory);
    const a = views.f32('k', 16, 2);
    expect(Array.from(a)).toEqual([1.5, -2]);
    expect(views.f32('k', 16, 2)).toBe(a);
  });

  it('rebuilds a view when the pointer or length changes', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const views = new MemoryViews(memory);
    const a = views.f32('k', 0, 4);
    expect(views.f32('k', 16, 4)).not.toBe(a);
    expect(views.f32('k', 16, 8).length).toBe(8);
  });

  it('rebuilds a view after memory.grow detaches the old buffer', () => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
    const views = new MemoryViews(memory);
    const before = views.f32('k', 0, 4);
    memory.grow(1);
    expect(before.length).toBe(0);
    const after = views.f32('k', 0, 4);
    expect(after === before).toBe(false);
    expect(after.length).toBe(4);
  });

  it('decodes UTF-8 strings from memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const bytes = new TextEncoder().encode('Fizz — ok');
    new Uint8Array(memory.buffer, 8, bytes.length).set(bytes);
    expect(new MemoryViews(memory).string(8, bytes.length)).toBe('Fizz — ok');
  });
});
