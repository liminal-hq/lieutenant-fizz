// Tests for what an Options change applies to.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@lieutenant-fizz/engine/storage';
import {
  clearOptionOverrides,
  overriddenOptions,
  readOptions,
  writeOptions,
  DEFAULT_OPTIONS,
} from './options';
import { SCOPE_NAMES, fileScope, markOverrides, rowKeys } from './option-scope';

describe('the rows an override marks', () => {
  it('names the options a row stands for', () => {
    expect(rowKeys('opt:text')).toEqual(['text']);
    expect(rowKeys('sound:style')).toEqual(['audio']);
    expect(rowKeys('sound:sfx')).toEqual(['sfx']);
    expect(rowKeys('display:density')).toEqual(['density']);
    expect(rowKeys('sound')).toEqual(['audio', 'music', 'sfx', 'musicVersion', 'sfxVersion']);
    expect(rowKeys('display')).toEqual(['fullscreen', 'awake', 'density']);
    for (const none of ['back', 'sound:reset', 'display:back', 'haptics', '', 'scope']) {
      expect(rowKeys(none)).toEqual([]);
    }
  });

  it('adds a star to the rows this episode overrides, and to the link to a screen that holds one', () => {
    const items = [
      { id: 'sound', label: 'Sound' },
      { id: 'opt:text', label: 'Text size' },
      { id: 'opt:motion', label: 'Motion' },
      { id: 'back', label: 'Back' },
    ];
    expect(markOverrides(items, new Set(['text', 'music'])).map((i) => i.label)).toEqual([
      'Sound *',
      'Text size *',
      'Motion',
      'Back',
    ]);
    expect(markOverrides(items, new Set())).toEqual(items);
  });
});

describe('the scope of a change', () => {
  it('names the two scopes and hands the file its own', () => {
    expect(SCOPE_NAMES).toEqual({ global: 'All episodes', episode: 'This episode' });
    expect(fileScope('global')).toBe('global');
    expect(fileScope('episode')).toEqual({ episode: 'episode-1' });
  });

  it('keeps a change for this episode out of the global values, and a global one out of its overrides', () => {
    const store = memoryStorage();
    writeOptions(store, { ...DEFAULT_OPTIONS, text: 1 }, 'global');
    writeOptions(store, { ...readOptions(store), music: 2 }, fileScope('episode'));
    expect(readOptions(store)).toMatchObject({ text: 1, music: 2 });
    expect(overriddenOptions(store)).toEqual(new Set(['music']));
    const file = JSON.parse(store.getItem('lf-options-v1') ?? '{}');
    expect(file.global).toEqual({ text: 1 });
    expect(file.episodes['episode-1']).toEqual({ music: 2 });
  });

  it("drops this episode's override when the same option is changed for every episode", () => {
    const store = memoryStorage();
    writeOptions(store, { ...DEFAULT_OPTIONS, music: 2 }, fileScope('episode'));
    expect(overriddenOptions(store).has('music')).toBe(true);
    writeOptions(store, { ...readOptions(store), music: 5 }, 'global');
    expect(overriddenOptions(store).has('music')).toBe(false);
    expect(readOptions(store).music).toBe(5);
  });

  it("clears the overrides asked for, or all of them, and keeps this episode's own options", () => {
    const store = memoryStorage();
    writeOptions(store, { ...DEFAULT_OPTIONS, music: 2, sfx: 3, layout: 1 }, fileScope('episode'));
    expect(overriddenOptions(store)).toEqual(new Set(['music', 'sfx']));
    clearOptionOverrides(store, ['music']);
    expect(overriddenOptions(store)).toEqual(new Set(['sfx']));
    expect(readOptions(store).music).toBe(DEFAULT_OPTIONS.music);
    clearOptionOverrides(store);
    expect(overriddenOptions(store).size).toBe(0);
    expect(readOptions(store)).toMatchObject({ sfx: DEFAULT_OPTIONS.sfx, layout: 1 });
  });

  it('keeps the old options key in step with what the episode sees', () => {
    const store = memoryStorage();
    writeOptions(store, { ...DEFAULT_OPTIONS, music: 1 }, fileScope('episode'));
    expect(JSON.parse(store.getItem('lf-ep1-options-v1') ?? '{}').music).toBe(1);
    clearOptionOverrides(store);
    expect(JSON.parse(store.getItem('lf-ep1-options-v1') ?? '{}').music).toBe(8);
  });
});
