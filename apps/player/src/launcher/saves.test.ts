// Tests for the launcher's saves export and import.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { FileSaver, OpenOutcome, SaveOutcome } from '@lieutenant-fizz/engine/file-save';
import { buildBundle, encodeBundle } from '@lieutenant-fizz/engine/saves-bundle';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import type { EpisodeInfo } from './catalog';
import { exportSaves, importSaves, saveKeysOf, IMPORT_NOT_SAVED, type SavesDeps } from './saves';

const info: EpisodeInfo = { page: 'p', saves: { auto: 'auto', slots: ['s1', 's2'] } };
const save = (at: number): string => JSON.stringify({ v: 3, at, progress: { lives: 3 } });
const NOW = new Date('2026-10-14T00:00:00Z');

function setup(
  held: Record<string, string>,
  opened: OpenOutcome = { status: 'cancelled' },
  saved: SaveOutcome = 'saved',
  flushed = true,
) {
  const store = memoryStorage(held);
  const calls: string[] = [];
  const written: { name: string; bytes: Uint8Array }[] = [];
  const saver: FileSaver = {
    open: async (extensions) => (calls.push(`open:${extensions.join(',')}`), opened),
    save: async (bytes, name) => (written.push({ name, bytes }), saved),
    canShare: () => false,
    share: async () => 'failed',
  };
  const deps: SavesDeps = {
    store,
    saver,
    episodes: saveKeysOf([['episode-1', info]]),
    app: '0.2.0',
    now: () => NOW,
    flush: async () => (calls.push('flush'), flushed),
    refresh: () => void calls.push('refresh'),
  };
  return { store, deps, calls, written };
}

describe('the keys an episode keeps saves under', () => {
  it('are the autosave then the slots, and an episode with no info has none', () => {
    expect(
      saveKeysOf([
        ['e', info],
        ['x', undefined],
      ]),
    ).toEqual([{ id: 'e', keys: ['auto', 's1', 's2'] }]);
  });
});

describe('exporting the saves', () => {
  it('writes a dated file with every save and says how many', async () => {
    const { deps, written } = setup({ auto: save(1), s2: save(2) });
    expect(await exportSaves(deps)).toBe('Exported 2 saves');
    expect(written[0]?.name).toBe('lieutenant-fizz-saves-2026-10-14.fizzsave');
    expect(JSON.parse(new TextDecoder().decode(written[0]?.bytes))).toMatchObject({
      format: 'fizzsave',
      app: '0.2.0',
      episodes: { 'episode-1': { saves: { auto: save(1), s2: save(2) } } },
    });
  });

  it('has nothing to say when the dialog is closed, and reports a failure or no saves', async () => {
    expect(
      await exportSaves(setup({ auto: save(1) }, undefined, 'cancelled').deps),
    ).toBeUndefined();
    expect(await exportSaves(setup({ auto: save(1) }, undefined, 'failed').deps)).toBe(
      "Couldn't save the file",
    );
    const none = setup({});
    expect(await exportSaves(none.deps)).toBe('No saves to export');
    expect(none.written).toEqual([]);
    expect(await exportSaves({ ...none.deps, saver: null })).toBe("Files can't be saved here");
  });
});

describe('importing saves', () => {
  const fileOf = (saves: Record<string, string>): OpenOutcome => ({
    status: 'opened',
    name: 'a.fizzsave',
    bytes: encodeBundle(
      buildBundle(memoryStorage(saves), saveKeysOf([['episode-1', info]]), '1', NOW).bundle,
    ),
  });

  it('merges newest-wins, writes the store out, and says what it did', async () => {
    const { deps, store, calls } = setup(
      { s1: save(50) },
      fileOf({ auto: save(5), s1: save(10), s2: save(7) }),
    );
    expect(await importSaves(deps)).toBe('Imported 2 saves, skipped 1 older');
    expect(store.getItem('auto')).toBe(save(5));
    expect(store.getItem('s1')).toBe(save(50));
    expect(store.getItem('s2')).toBe(save(7));
    expect(calls).toEqual(['open:fizzsave', 'refresh', 'flush']);
  });

  it('says so when the file is not usable, and changes nothing', async () => {
    const bad = (bytes: string): OpenOutcome => ({
      status: 'opened',
      name: 'x',
      bytes: new TextEncoder().encode(bytes),
    });
    const run = async (opened: OpenOutcome) => {
      const s = setup({ auto: save(1) }, opened);
      const message = await importSaves(s.deps);
      expect(s.store.getItem('auto')).toBe(save(1));
      return message;
    };
    expect(await run({ status: 'cancelled' })).toBeUndefined();
    expect(await run({ status: 'toolarge' })).toBe('That file is too big to be a saves file');
    expect(await run({ status: 'failed' })).toBe("Couldn't open the file");
    expect(await run(bad('hello'))).toBe("That isn't a Fizz saves file");
    expect(await run(bad(JSON.stringify({ format: 'fizzsave', version: 9, episodes: {} })))).toBe(
      'That file is from a newer version of the app',
    );
    expect(await run(bad(JSON.stringify({ format: 'fizzsave', version: 1, episodes: {} })))).toBe(
      'Nothing in that file could be used',
    );
  });

  it('reports a store that would not take the saves, or would not write them out', async () => {
    const full = setup({}, fileOf({ auto: save(5) }));
    full.deps.store.setItem = () => {
      throw new Error('full');
    };
    expect(await importSaves(full.deps)).toBe(IMPORT_NOT_SAVED);
    const unflushed = setup({}, fileOf({ auto: save(5) }), 'saved', false);
    expect(await importSaves(unflushed.deps)).toBe(IMPORT_NOT_SAVED);
    expect(await importSaves({ ...unflushed.deps, saver: null })).toBe(
      "Files can't be opened here",
    );
  });
});
