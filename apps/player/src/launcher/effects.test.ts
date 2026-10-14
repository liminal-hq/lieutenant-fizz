// Tests for carrying out the launcher's effects.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage, type FlushableStorage } from '@lieutenant-fizz/engine/storage';
import { DEV_UNLOCK_KEY } from './dev-unlock';
import { SAVE_FAILED, applyEffects } from './effects';

function setup(flush?: () => Promise<boolean>) {
  const log: string[] = [];
  const base = memoryStorage();
  const store: FlushableStorage | typeof base = flush
    ? { ...base, flush: async () => (log.push('flush'), flush()) }
    : base;
  return {
    log,
    store,
    deps: {
      store,
      toast: (m: string) => log.push(`toast:${m}`),
      navigate: (u: string) => log.push(`go:${u}`),
    },
  };
}

describe('applying the launcher effects', () => {
  it('shows toasts and saves the unlock in the store', async () => {
    const { deps, store, log } = setup();
    await applyEffects(
      [
        { kind: 'save-unlock', unlocked: true },
        { kind: 'toast', message: 'Hello' },
      ],
      deps,
    );
    expect(store.getItem(DEV_UNLOCK_KEY)).toBe('1');
    expect(log).toEqual(['toast:Hello']);
  });

  it('writes the store out before it leaves', async () => {
    const { deps, log } = setup(async () => true);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], deps);
    expect(log).toEqual(['flush', 'go:debug.html']);
  });

  it('stays put and says so when the store could not be written', async () => {
    const failed = setup(async () => false);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], failed.deps);
    expect(failed.log).toEqual(['flush', `toast:${SAVE_FAILED}`]);
    const threw = setup(async () => {
      throw new Error('disk');
    });
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], threw.deps);
    expect(threw.log).toEqual(['flush', `toast:${SAVE_FAILED}`]);
  });

  it('leaves at once when the store has nothing held back to write', async () => {
    const { deps, log } = setup();
    await applyEffects([{ kind: 'navigate', url: 'episode-1/index.html' }], deps);
    expect(log).toEqual(['go:episode-1/index.html']);
  });
});
