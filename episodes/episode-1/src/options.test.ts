// Tests for the player options: parsing, saving, stepping and the reduced-motion rule.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  OPTIONS_KEY,
  parseOptions,
  readOptions,
  reducedMotion,
  serialiseOptions,
  stepOption,
  volumeOf,
  writeOptions,
} from './options';

describe('options storage', () => {
  it('round-trips every option', () => {
    const o = { music: 3, sfx: 0, captions: false, layout: 1, text: 1, motion: 2 };
    expect(parseOptions(serialiseOptions(o))).toEqual(o);
  });

  it('falls back to the defaults for nothing, junk or another version', () => {
    expect(parseOptions(null)).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('not json')).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('{"v":2,"music":1}')).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('[]')).toEqual(DEFAULT_OPTIONS);
  });

  it('replaces only the invalid fields', () => {
    const got = parseOptions(
      '{"v":1,"music":99,"sfx":2,"captions":"yes","layout":1,"text":-1,"motion":1}',
    );
    expect(got).toEqual({ ...DEFAULT_OPTIONS, sfx: 2, layout: 1, motion: 1 });
  });

  it('starts volumes at full', () => {
    expect(DEFAULT_OPTIONS.music).toBe(8);
    expect(DEFAULT_OPTIONS.sfx).toBe(8);
    expect(volumeOf(8)).toBe(1);
    expect(volumeOf(0)).toBe(0);
    expect(volumeOf(4)).toBe(0.5);
  });

  it('reads and writes through a storage double and survives a throwing one', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(readOptions(store)).toEqual(DEFAULT_OPTIONS);
    expect(writeOptions(store, { ...DEFAULT_OPTIONS, music: 2 })).toBe(true);
    expect(data.has(OPTIONS_KEY)).toBe(true);
    expect(readOptions(store).music).toBe(2);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readOptions(broken)).toEqual(DEFAULT_OPTIONS);
    expect(writeOptions(broken, DEFAULT_OPTIONS)).toBe(false);
    expect(writeOptions(null, DEFAULT_OPTIONS)).toBe(false);
  });
});

describe('stepOption', () => {
  it('clamps a meter between 0 and 8', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'music', 1).music).toBe(8);
    expect(stepOption({ ...DEFAULT_OPTIONS, music: 0 }, 'music', -1).music).toBe(0);
    expect(stepOption({ ...DEFAULT_OPTIONS, sfx: 3 }, 'sfx', 1).sfx).toBe(4);
  });

  it('wraps a meter from full to silent when asked', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'music', 1, true).music).toBe(0);
    expect(stepOption({ ...DEFAULT_OPTIONS, music: 0 }, 'music', -1, true).music).toBe(8);
  });

  it('wraps choices around in both directions', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'motion', -1).motion).toBe(2);
    expect(stepOption({ ...DEFAULT_OPTIONS, motion: 2 }, 'motion', 1).motion).toBe(0);
    expect(stepOption(DEFAULT_OPTIONS, 'layout', 1).layout).toBe(1);
    expect(stepOption({ ...DEFAULT_OPTIONS, layout: 1 }, 'layout', 1).layout).toBe(0);
    expect(stepOption(DEFAULT_OPTIONS, 'text', 1).text).toBe(1);
  });

  it('toggles captions', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'captions', 1).captions).toBe(false);
    expect(stepOption({ ...DEFAULT_OPTIONS, captions: false }, 'captions', -1).captions).toBe(true);
  });

  it('does not change the other options', () => {
    const o = { music: 2, sfx: 3, captions: false, layout: 1, text: 1, motion: 2 };
    expect(stepOption(o, 'music', 1)).toEqual({ ...o, music: 3 });
  });
});

describe('reducedMotion', () => {
  it('follows the system on System, and overrides it otherwise', () => {
    expect(reducedMotion({ motion: 0 }, true)).toBe(true);
    expect(reducedMotion({ motion: 0 }, false)).toBe(false);
    expect(reducedMotion({ motion: 1 }, false)).toBe(true);
    expect(reducedMotion({ motion: 2 }, true)).toBe(false);
  });
});
