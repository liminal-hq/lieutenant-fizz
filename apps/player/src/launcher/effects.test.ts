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

  it('hands Back to the system after the write and before it leaves', async () => {
    const { deps, log } = setup(async () => true);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], {
      ...deps,
      releaseBack: async () => void log.push('release'),
    });
    expect(log).toEqual(['flush', 'release', 'go:debug.html']);
  });

  it('keeps Back when the write failed and the launcher stays', async () => {
    const { deps, log } = setup(async () => false);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], {
      ...deps,
      releaseBack: async () => void log.push('release'),
    });
    expect(log).not.toContain('release');
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

  it('starts an episode where the launch says, after the write and with Back handed over', async () => {
    const { deps, log } = setup(async () => true);
    await applyEffects(
      [{ kind: 'launch', episode: 'episode-1', launch: { kind: 'load', slot: 2 } }],
      {
        ...deps,
        pageOf: () => 'episode-1/index.html',
        releaseBack: async () => void log.push('release'),
      },
    );
    expect(log).toEqual(['flush', 'release', 'go:episode-1/index.html?launch=load:2']);
  });

  it('says so when the episode is not installed, and does not leave', async () => {
    const { deps, log } = setup();
    await applyEffects([{ kind: 'launch', episode: 'episode-9', launch: { kind: 'new' } }], {
      ...deps,
      pageOf: () => undefined,
    });
    expect(log).toEqual(["toast:That episode isn't installed"]);
  });

  it('leaves at once when the store has nothing held back to write', async () => {
    const { deps, log } = setup();
    await applyEffects([{ kind: 'navigate', url: 'episode-1/index.html' }], deps);
    expect(log).toEqual(['go:episode-1/index.html']);
  });

  it('leaves once when a second press comes while the first is still writing', async () => {
    let finish: (v: boolean) => void = () => {};
    const { log, store, deps } = setup(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    void store;
    const first = applyEffects([{ kind: 'navigate', url: 'debug.html' }], deps);
    const second = applyEffects([{ kind: 'navigate', url: 'debug.html' }], deps);
    finish(true);
    await Promise.all([first, second]);
    expect(log.filter((l) => l.startsWith('go:'))).toEqual(['go:debug.html']);
  });

  it('can leave again after a failed write, and takes Back back when the page does not go', async () => {
    const failed = setup(async () => false);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], failed.deps);
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], failed.deps);
    expect(failed.log.filter((l) => l.startsWith('flush'))).toHaveLength(2);

    const log: string[] = [];
    const deps = {
      ...setup(async () => true).deps,
      toast: (m: string) => log.push(`toast:${m}`),
      navigate: () => {
        throw new Error('no page');
      },
      releaseBack: async () => void log.push('release'),
      reclaimBack: () => void log.push('reclaim'),
    };
    await applyEffects([{ kind: 'navigate', url: 'debug.html' }], deps);
    expect(log).toEqual(['release', 'reclaim', "toast:Couldn't open that page"]);
  });
});
