// Tests for the native-window fullscreen backend, against a fake window.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { fakeNativeWindow, nativeFullscreenBackend, type NativeWindow } from './native-fullscreen';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const PLAN = { fullscreen: true, lock: false };

describe('nativeFullscreenBackend', () => {
  it('is native and captures Esc', async () => {
    const b = await nativeFullscreenBackend(fakeNativeWindow());
    expect(b.kind).toBe('native');
    expect(b.escapeCaptured).toBe(true);
    expect(b.isFullscreen()).toBe(false);
  });

  it('starts from the window as it is', async () => {
    const w = fakeNativeWindow();
    await w.setFullscreen(true);
    expect((await nativeFullscreenBackend(w)).isFullscreen()).toBe(true);
  });

  it('enters and leaves, telling listeners once each', async () => {
    const w = fakeNativeWindow();
    const b = await nativeFullscreenBackend(w);
    const seen = vi.fn();
    b.onChange(seen);
    expect((await b.enter(PLAN)).fullscreen).toBe('ok');
    expect(b.isFullscreen()).toBe(true);
    expect(await w.isFullscreen()).toBe(true);
    expect(await b.exit()).toBe('ok');
    expect(b.isFullscreen()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('asks for nothing when the plan has no fullscreen step, and leaves nothing when not fullscreen', async () => {
    const w = fakeNativeWindow();
    const b = await nativeFullscreenBackend(w);
    expect((await b.enter({ fullscreen: false, lock: true })).fullscreen).toBe('skipped');
    expect(await w.isFullscreen()).toBe(false);
    expect(await b.exit()).toBe('skipped');
  });

  it('follows the window manager through resize events', async () => {
    const w = fakeNativeWindow();
    const b = await nativeFullscreenBackend(w);
    const seen = vi.fn();
    b.onChange(seen);
    await w.setFullscreen(true);
    w.resized();
    await settle();
    expect(b.isFullscreen()).toBe(true);
    w.resized();
    await settle();
    expect(seen).toHaveBeenCalledOnce();
    await w.setFullscreen(false);
    w.resized();
    await settle();
    expect(b.isFullscreen()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('reports a refusal and never throws', async () => {
    const w: NativeWindow = {
      isFullscreen: async () => {
        throw new Error('no');
      },
      setFullscreen: async () => {
        throw new Error('no');
      },
      onResized: async () => {
        throw new Error('no');
      },
    };
    const b = await nativeFullscreenBackend(w);
    expect(b.isFullscreen()).toBe(false);
    expect((await b.enter(PLAN)).fullscreen).toBe('denied');
    expect(b.isFullscreen()).toBe(false);
  });

  it('reports a refusal to leave', async () => {
    const w = fakeNativeWindow();
    const b = await nativeFullscreenBackend(w);
    await b.enter(PLAN);
    w.setFullscreen = async () => {
      throw new Error('no');
    };
    expect(await b.exit()).toBe('denied');
    expect(b.isFullscreen()).toBe(true);
  });

  it('stops listening when disposed', async () => {
    const w = fakeNativeWindow();
    const b = await nativeFullscreenBackend(w);
    const seen = vi.fn();
    b.onChange(seen);
    b.dispose();
    await w.setFullscreen(true);
    w.resized();
    await settle();
    expect(seen).not.toHaveBeenCalled();
  });
});
