// Tests for the options file.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  EMPTY_OPTIONS_FILE,
  OPTIONS_FILE_KEY,
  clearOverrides,
  migrateLegacy,
  overriddenKeys,
  parseOptionsFile,
  readOptionsFile,
  resetGlobal,
  resolveRaw,
  serialiseOptionsFile,
  setValue,
  writeOptionsFile,
} from './options-file';
import { memoryStorage } from './storage';

const OWN = ['layout', 'captions'];
const file = (
  global: Record<string, unknown>,
  episodes: Record<string, Record<string, unknown>> = {},
) => ({
  v: 1 as const,
  global,
  episodes,
});

describe('reading the file', () => {
  it('reads what was saved, and an empty file for nothing, another version or rubbish', () => {
    const f = file({ music: 4 }, { a: { sfx: 2 } });
    expect(parseOptionsFile(serialiseOptionsFile(f))).toEqual(f);
    for (const bad of [null, '', 'not json', '[]', '{"v":2,"global":{"music":1}}', '"x"']) {
      expect(parseOptionsFile(bad)).toEqual(EMPTY_OPTIONS_FILE);
    }
  });

  it('keeps only the sections that are records', () => {
    const f = parseOptionsFile('{"v":1,"global":[1],"episodes":{"a":{"x":1},"b":3,"c":null}}');
    expect(f).toEqual(file({}, { a: { x: 1 } }));
  });
});

describe('what an episode sees', () => {
  it("is the global values with the episode's overrides on top", () => {
    const f = file({ music: 4, sfx: 6 }, { a: { sfx: 1, layout: 1 } });
    expect(resolveRaw(f, 'a', OWN)).toEqual({ music: 4, sfx: 1, layout: 1 });
    expect(resolveRaw(f, 'b', OWN)).toEqual({ music: 4, sfx: 6 });
  });

  it('ignores a global value for an option only the episode has', () => {
    const f = file({ layout: 1, music: 3 });
    expect(resolveRaw(f, 'a', OWN)).toEqual({ music: 3 });
  });
});

describe('changing a value', () => {
  it('sets a global value for every episode, and an override for one', () => {
    let f = setValue(EMPTY_OPTIONS_FILE, 'global', 'a', 'music', 5, OWN);
    expect(f.global).toEqual({ music: 5 });
    f = setValue(f, { episode: 'a' }, 'a', 'music', 2, OWN);
    expect(f.global).toEqual({ music: 5 });
    expect(f.episodes['a']).toEqual({ music: 2 });
    expect(resolveRaw(f, 'a', OWN)['music']).toBe(2);
    expect(resolveRaw(f, 'b', OWN)['music']).toBe(5);
  });

  it('puts an option only the episode has in its section, whatever the scope', () => {
    const f = setValue(EMPTY_OPTIONS_FILE, 'global', 'a', 'layout', 1, OWN);
    expect(f.global).toEqual({});
    expect(f.episodes['a']).toEqual({ layout: 1 });
  });

  it('does not change the file it was given', () => {
    const f = file({ music: 1 });
    setValue(f, 'global', 'a', 'music', 7, OWN);
    expect(f.global).toEqual({ music: 1 });
  });
});

describe('overrides', () => {
  const f = file({ music: 5 }, { a: { music: 2, layout: 1 }, b: { sfx: 0 } });

  it('lists the options an episode overrides, not counting the ones only it has', () => {
    expect(overriddenKeys(f, 'a', OWN)).toEqual(['music']);
    expect(overriddenKeys(f, 'b', OWN)).toEqual(['sfx']);
    expect(overriddenKeys(f, 'c', OWN)).toEqual([]);
  });

  it("clears an episode's overrides and keeps its own options and the other episodes", () => {
    const cleared = clearOverrides(f, 'a', OWN);
    expect(cleared.episodes['a']).toEqual({ layout: 1 });
    expect(cleared.episodes['b']).toEqual({ sfx: 0 });
    expect(clearOverrides(f, 'c', OWN)).toBe(f);
  });

  it('clears only the keys asked for', () => {
    const many = file({}, { a: { music: 1, sfx: 2, layout: 1 } });
    expect(clearOverrides(many, 'a', OWN, ['music']).episodes['a']).toEqual({ sfx: 2, layout: 1 });
  });

  it('drops every global value to put each back to its default', () => {
    expect(resetGlobal(f)).toEqual(file({}, f.episodes));
  });
});

describe('carrying over options an older build saved', () => {
  const blob = (o: Record<string, unknown>) => JSON.stringify({ v: 1, ...o });

  it('seeds the global values from the first episode and keeps its own options in its section', () => {
    const f = migrateLegacy(
      [{ episode: 'a', json: blob({ music: 3, sfx: 7, layout: 1, captions: false }) }],
      OWN,
    );
    expect(f.global).toEqual({ music: 3, sfx: 7 });
    expect(f.episodes['a']).toEqual({ layout: 1, captions: false });
  });

  it("takes the global values from the first episode only, and every episode's own options", () => {
    const f = migrateLegacy(
      [
        { episode: 'a', json: blob({ music: 3 }) },
        { episode: 'b', json: blob({ music: 1, layout: 1 }) },
      ],
      OWN,
    );
    expect(f.global).toEqual({ music: 3 });
    expect(f.episodes['b']).toEqual({ layout: 1 });
  });

  it('skips a blob that is missing, unreadable or another version', () => {
    expect(migrateLegacy([{ episode: 'a', json: null }], OWN)).toEqual(EMPTY_OPTIONS_FILE);
    expect(migrateLegacy([{ episode: 'a', json: 'nope' }], OWN)).toEqual(EMPTY_OPTIONS_FILE);
    expect(migrateLegacy([{ episode: 'a', json: '{"v":9,"music":1}' }], OWN)).toEqual(
      EMPTY_OPTIONS_FILE,
    );
    const f = migrateLegacy(
      [
        { episode: 'a', json: 'nope' },
        { episode: 'b', json: blob({ music: 2 }) },
      ],
      OWN,
    );
    expect(f.global).toEqual({ music: 2 });
  });
});

describe('the store', () => {
  const legacy = [{ episode: 'a', key: 'old-a' }];

  it('carries the old options over when there is no file yet, without writing anything', () => {
    const store = memoryStorage({ 'old-a': JSON.stringify({ v: 1, music: 2, layout: 1 }) });
    const f = readOptionsFile(store, legacy, OWN);
    expect(f.global).toEqual({ music: 2 });
    expect(f.episodes['a']).toEqual({ layout: 1 });
    expect(store.getItem(OPTIONS_FILE_KEY)).toBeNull();
  });

  it('reads the file once there is one, and no longer looks at the old key', () => {
    const store = memoryStorage({ 'old-a': JSON.stringify({ v: 1, music: 2 }) });
    writeOptionsFile(store, file({ music: 6 }));
    expect(readOptionsFile(store, legacy, OWN).global).toEqual({ music: 6 });
  });

  it('saves and reads back, and copes with a store that throws', () => {
    const store = memoryStorage();
    const f = file({ sfx: 3 }, { a: { sfx: 1 } });
    expect(writeOptionsFile(store, f)).toBe(true);
    expect(readOptionsFile(store)).toEqual(f);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readOptionsFile(broken, legacy, OWN)).toEqual(EMPTY_OPTIONS_FILE);
    expect(writeOptionsFile(broken, f)).toBe(false);
    expect(writeOptionsFile(null, f)).toBe(false);
  });
});
