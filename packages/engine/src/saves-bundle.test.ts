// Tests for the `.fizzsave` bundle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from './storage';
import {
  FIZZSAVE_VERSION,
  MAX_BUNDLE_BYTES,
  MAX_SAVE_BYTES,
  buildBundle,
  bundleName,
  encodeBundle,
  parseBundle,
  planImport,
  savedAtOf,
  type EpisodeSaveKeys,
} from './saves-bundle';

const save = (at: number, extra = ''): string =>
  JSON.stringify({ v: 3, at, progress: { lives: 3 }, extra });
const EP: EpisodeSaveKeys[] = [{ id: 'episode-1', keys: ['auto', 's1', 's2'] }];
const NOW = new Date('2026-10-14T12:00:00Z');
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('reading when a save was written', () => {
  it('needs an object with a finite time and a progress object, and a size the game accepts', () => {
    expect(savedAtOf(save(5))).toBe(5);
    expect(savedAtOf(null)).toBeUndefined();
    expect(savedAtOf('nope')).toBeUndefined();
    expect(savedAtOf('[]')).toBeUndefined();
    expect(savedAtOf(JSON.stringify({ at: 1, progress: [] }))).toBeUndefined();
    expect(savedAtOf(JSON.stringify({ at: 'x', progress: {} }))).toBeUndefined();
    expect(savedAtOf(save(5, 'x'.repeat(MAX_SAVE_BYTES)))).toBeUndefined();
  });
});

describe('building a bundle', () => {
  it('holds each episode’s saves as stored, leaving out empty and unreadable slots', () => {
    const store = memoryStorage({ auto: save(3), s2: save(9), s1: 'garbage' });
    const { bundle, count } = buildBundle(store, EP, '1.0.0', NOW);
    expect(count).toBe(2);
    expect(bundle).toEqual({
      format: 'fizzsave',
      version: FIZZSAVE_VERSION,
      app: '1.0.0',
      exportedAt: '2026-10-14T12:00:00.000Z',
      episodes: { 'episode-1': { saves: { auto: save(3), s2: save(9) } } },
    });
  });

  it('has no episode entry for an episode with nothing to save, and a dated file name', () => {
    expect(buildBundle(memoryStorage(), EP, '1', NOW)).toMatchObject({ count: 0 });
    expect(buildBundle(memoryStorage(), EP, '1', NOW).bundle.episodes).toEqual({});
    expect(bundleName(NOW)).toBe('lieutenant-fizz-saves-2026-10-14.fizzsave');
  });

  it('round-trips through the file bytes without changing a save', () => {
    const store = memoryStorage({ auto: save(3) });
    const { bundle } = buildBundle(store, EP, '1', NOW);
    const parsed = parseBundle(encodeBundle(bundle));
    expect(parsed).toEqual({ ok: true, bundle });
  });
});

describe('parsing a bundle', () => {
  const good = { format: 'fizzsave', version: 1, episodes: {} };

  it('refuses a file that is too big, not JSON, or not a bundle', () => {
    expect(parseBundle(new Uint8Array(MAX_BUNDLE_BYTES + 1))).toEqual({
      ok: false,
      reason: 'toolarge',
    });
    expect(parseBundle(new TextEncoder().encode('not json'))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseBundle(new Uint8Array([0xff, 0xfe]))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseBundle(bytes([]))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseBundle(bytes({ ...good, format: 'zip' }))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseBundle(bytes({ ...good, version: 'one' }))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseBundle(bytes({ ...good, version: 0 }))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseBundle(bytes({ ...good, episodes: [] }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a bundle from a newer version of the app, unread', () => {
    expect(parseBundle(bytes({ ...good, version: FIZZSAVE_VERSION + 1 }))).toEqual({
      ok: false,
      reason: 'newer',
    });
  });

  it('keeps only the text saves of well-formed episodes', () => {
    const parsed = parseBundle(
      bytes({
        ...good,
        episodes: {
          a: { saves: { k: 'text', n: 5 } },
          b: 'nope',
          c: { saves: 'nope' },
        },
      }),
    );
    expect(parsed).toMatchObject({
      ok: true,
      bundle: { episodes: { a: { saves: { k: 'text' } } } },
    });
    if (parsed.ok) expect(Object.keys(parsed.bundle.episodes)).toEqual(['a']);
  });
});

describe('merging a bundle into the saves held', () => {
  const bundleOf = (saves: Record<string, string>, id = 'episode-1') => ({
    format: 'fizzsave' as const,
    version: 1,
    app: '',
    exportedAt: '',
    episodes: { [id]: { saves } },
  });

  it('writes a slot that is empty or older, and keeps one that is as new or newer', () => {
    const store = memoryStorage({ s1: save(10), s2: save(20) });
    const plan = planImport(store, bundleOf({ auto: save(5), s1: save(10), s2: save(30) }), EP);
    expect(plan.writes).toEqual({ auto: save(5), s2: save(30) });
    expect(plan).toMatchObject({ imported: 2, skipped: 1, ignored: 0 });
  });

  it('replaces a held slot that is not a readable save', () => {
    const store = memoryStorage({ s1: 'garbage' });
    expect(planImport(store, bundleOf({ s1: save(1) }), EP).imported).toBe(1);
  });

  it('ignores unknown episodes, keys the episode does not keep saves under, and saves the game would refuse', () => {
    const plan = planImport(
      memoryStorage(),
      {
        ...bundleOf({ other: save(1), s1: 'garbage', s2: save(2, 'x'.repeat(MAX_SAVE_BYTES)) }),
        episodes: {
          'episode-1': {
            saves: { other: save(1), s1: 'garbage', s2: save(2, 'x'.repeat(MAX_SAVE_BYTES)) },
          },
          'episode-9': { saves: { auto: save(1) } },
        },
      },
      EP,
    );
    expect(plan).toMatchObject({ writes: {}, imported: 0, skipped: 0, ignored: 4 });
  });

  it('ignores a save dated far in the future, which would win every later merge', () => {
    const now = Date.parse('2026-10-14T00:00:00Z');
    const plan = planImport(memoryStorage(), bundleOf({ s1: save(1e15), s2: save(now) }), EP, now);
    expect(plan).toMatchObject({ imported: 1, ignored: 1 });
    expect(Object.keys(plan.writes)).toEqual(['s2']);
  });

  it('does not let a key named like an object property through', () => {
    const plan = planImport(
      memoryStorage(),
      bundleOf({ __proto__: save(1), constructor: save(1) } as never),
      EP,
    );
    expect(plan.imported).toBe(0);
    expect(Object.keys(plan.writes)).toEqual([]);
  });
});
