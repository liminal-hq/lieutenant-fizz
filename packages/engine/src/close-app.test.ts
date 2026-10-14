// Tests for closing the app.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { closeApp } from './close-app';

describe('closeApp', () => {
  it('leaves fullscreen, flushes the store, then quits', async () => {
    const calls: string[] = [];
    const done = await closeApp({
      exitFullscreen: async () => void calls.push('fs'),
      flush: async () => (calls.push('flush'), true),
      quit: async () => void calls.push('quit'),
    });
    expect(done).toBe(true);
    expect(calls).toEqual(['fs', 'flush', 'quit']);
  });

  it('quits when the store has no flush', async () => {
    const quit = vi.fn(async () => {});
    expect(await closeApp({ exitFullscreen: async () => {}, quit })).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('stays open when the flush fails, so the unsaved changes are not lost', async () => {
    const quit = vi.fn(async () => {});
    const done = await closeApp({
      exitFullscreen: async () => {},
      flush: async () => false,
      quit,
    });
    expect(done).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });
});
