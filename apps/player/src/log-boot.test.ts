// Tests that the probe and haptics pages start the log bridge before their other imports evaluate.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@lieutenant-fizz/engine/tauri-log', () => ({ initTauriLogging: init }));
vi.mock('@lieutenant-fizz/engine/storage', () => {
  throw new Error('storage failed while loading');
});
vi.mock('@lieutenant-fizz/engine/haptic-strength', () => {
  throw new Error('haptics failed while loading');
});

describe('page entries', () => {
  beforeEach(() => {
    init.mockClear();
    vi.resetModules();
  });

  it('starts logging before the probe page loads a dependency that throws', async () => {
    await expect(import('./probe')).rejects.toThrow();
    expect(init).toHaveBeenCalledWith({ prefix: 'probe' });
  });

  it('starts logging before the haptics page loads a dependency that throws', async () => {
    await expect(import('./haptics')).rejects.toThrow();
    expect(init).toHaveBeenCalledWith({ prefix: 'haptics' });
  });
});
