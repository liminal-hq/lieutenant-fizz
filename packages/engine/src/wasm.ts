// Loader and typed memory views for raw (no wasm-bindgen) WASM modules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A raw (no wasm-bindgen) module instance: its typed exports and linear memory. */
export interface RawWasm<E> {
  exports: E;
  memory: WebAssembly.Memory;
}

/** Loads and instantiates a module from a URL (browser) or bytes (tests, Node). */
export async function loadWasm<E>(
  source: string | URL | BufferSource,
  imports: WebAssembly.Imports = {},
): Promise<RawWasm<E>> {
  let instance: WebAssembly.Instance;
  if (typeof source === 'string' || source instanceof URL) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${String(source)}: ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (
      type.includes('application/wasm') &&
      typeof WebAssembly.instantiateStreaming === 'function'
    ) {
      ({ instance } = await WebAssembly.instantiateStreaming(res, imports));
    } else {
      ({ instance } = await WebAssembly.instantiate(await res.arrayBuffer(), imports));
    }
  } else {
    ({ instance } = await WebAssembly.instantiate(source, imports));
  }
  const exports = instance.exports as unknown as E & { memory?: WebAssembly.Memory };
  if (!exports.memory) throw new Error('WASM module does not export its memory');
  return { exports, memory: exports.memory };
}

/**
 * Typed-array views over linear memory. `memory.grow` detaches old views, so every access goes
 * through this cache, which rebuilds a view when the underlying buffer changes.
 */
export class MemoryViews {
  private cache = new Map<string, { buffer: ArrayBufferLike; view: Float32Array }>();

  constructor(private readonly memory: WebAssembly.Memory) {}

  f32(key: string, ptr: number, length: number): Float32Array {
    const buffer = this.memory.buffer;
    const hit = this.cache.get(key);
    if (hit && hit.buffer === buffer && hit.view.byteOffset === ptr && hit.view.length === length) {
      return hit.view;
    }
    const view = new Float32Array(buffer, ptr, length);
    this.cache.set(key, { buffer, view });
    return view;
  }

  private bytes = new Map<string, { buffer: ArrayBufferLike; view: Uint8Array }>();

  u8(key: string, ptr: number, length: number): Uint8Array {
    const buffer = this.memory.buffer;
    const hit = this.bytes.get(key);
    if (hit && hit.buffer === buffer && hit.view.byteOffset === ptr && hit.view.length === length) {
      return hit.view;
    }
    const view = new Uint8Array(buffer, ptr, length);
    this.bytes.set(key, { buffer, view });
    return view;
  }

  string(ptr: number, len: number): string {
    return new TextDecoder().decode(new Uint8Array(this.memory.buffer, ptr, len));
  }
}
