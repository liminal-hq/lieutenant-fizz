// Tests for the player options: parsing, saving, stepping and the reduced-motion rule.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  audioChoice,
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
    const o = {
      music: 3,
      sfx: 0,
      audio: 2,
      captions: false,
      layout: 1,
      text: 1,
      motion: 2,
      lab: true,
      rumble: 1,
      hapticsLab: true,
    };
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

  it('loads a save from before the Style setting with Auto', () => {
    const old = '{"v":1,"music":3,"sfx":5,"captions":false,"layout":1,"text":1,"motion":2}';
    expect(parseOptions(old)).toEqual({
      music: 3,
      sfx: 5,
      audio: 0,
      captions: false,
      layout: 1,
      text: 1,
      motion: 2,
      lab: false,
      rumble: 3,
      hapticsLab: false,
    });
  });

  it('keeps the Sound lab off unless it is saved as true, and rejects anything else', () => {
    expect(DEFAULT_OPTIONS.lab).toBe(false);
    expect(parseOptions('{"v":1,"lab":true}').lab).toBe(true);
    for (const bad of ['"on"', '1', 'null', '[]'])
      expect(parseOptions(`{"v":1,"lab":${bad}}`).lab).toBe(false);
  });

  it('defaults Rumble to Strong and the haptics lab to Off, and rejects anything else', () => {
    expect(DEFAULT_OPTIONS.rumble).toBe(3);
    expect(DEFAULT_OPTIONS.hapticsLab).toBe(false);
    for (const good of [0, 1, 2, 3])
      expect(parseOptions(`{"v":1,"rumble":${good}}`).rumble).toBe(good);
    for (const bad of ['4', '-1', '1.5', '"2"', 'null', 'true'])
      expect(parseOptions(`{"v":1,"rumble":${bad}}`).rumble, bad).toBe(3);
    expect(parseOptions('{"v":1,"hapticsLab":true}').hapticsLab).toBe(true);
    for (const bad of ['"on"', '1', 'null', '[]'])
      expect(parseOptions(`{"v":1,"hapticsLab":${bad}}`).hapticsLab).toBe(false);
  });

  it('rejects a Style outside Auto, Classic and Enhanced', () => {
    for (const bad of ['3', '-1', '1.5', '"classic"', 'null', 'true']) {
      expect(parseOptions(`{"v":1,"audio":${bad}}`).audio).toBe(0);
    }
    expect(parseOptions('{"v":1,"audio":2}').audio).toBe(2);
  });

  it('keeps the same storage key and version', () => {
    expect(OPTIONS_KEY).toBe('lf-ep1-options-v1');
    expect(JSON.parse(serialiseOptions(DEFAULT_OPTIONS)).v).toBe(1);
  });

  it('reads the saved Style as a mode, or none on Auto', () => {
    expect(audioChoice({ audio: 0 })).toBeUndefined();
    expect(audioChoice({ audio: 1 })).toBe('classic');
    expect(audioChoice({ audio: 2 })).toBe('enhanced');
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

  it('toggles the Sound lab in either direction', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'lab', 1).lab).toBe(true);
    expect(stepOption({ ...DEFAULT_OPTIONS, lab: true }, 'lab', -1).lab).toBe(false);
  });

  it('toggles the haptics lab and wraps Rumble through its four levels', () => {
    expect(stepOption(DEFAULT_OPTIONS, 'hapticsLab', 1).hapticsLab).toBe(true);
    expect(stepOption({ ...DEFAULT_OPTIONS, hapticsLab: true }, 'hapticsLab', -1).hapticsLab).toBe(
      false,
    );
    expect(stepOption(DEFAULT_OPTIONS, 'rumble', 1).rumble).toBe(0);
    expect(stepOption(DEFAULT_OPTIONS, 'rumble', -1).rumble).toBe(2);
  });

  it('does not change the other options', () => {
    const o = {
      music: 2,
      sfx: 3,
      audio: 1,
      captions: false,
      layout: 1,
      text: 1,
      motion: 2,
      lab: true,
      rumble: 1,
      hapticsLab: true,
    };
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
