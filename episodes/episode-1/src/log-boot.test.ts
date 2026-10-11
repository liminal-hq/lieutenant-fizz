// Tests that the entry point starts the log bridge before its other imports evaluate, so a startup failure is logged.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@lieutenant-fizz/engine/tauri-log', () => ({ initTauriLogging: init }));
vi.mock('./game', () => {
  throw new Error('the game failed while loading');
});

describe('main entry', () => {
  it('starts logging before a dependency that throws while it loads', async () => {
    await expect(import('./main')).rejects.toThrow();
    expect(init).toHaveBeenCalledWith({ prefix: 'episode-1' });
  });
});
