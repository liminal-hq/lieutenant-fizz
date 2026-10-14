// Tests for the options every episode shares.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GLOBAL_OPTIONS,
  GLOBAL_KEYS,
  METER_BLOCKS,
  parseGlobalOptions,
  stepGlobalOption,
} from './options';

describe('the shared options', () => {
  it('start with full volume, Auto sound, the screen kept on and Cozy rows', () => {
    const d = DEFAULT_GLOBAL_OPTIONS;
    expect([d.music, d.sfx]).toEqual([METER_BLOCKS, METER_BLOCKS]);
    expect([d.audio, d.musicVersion, d.sfxVersion]).toEqual([0, 0, 0]);
    expect(d.awake).toBe(true);
    expect(d.density).toBe(1);
    expect(Object.keys(d).sort()).toEqual([...GLOBAL_KEYS].sort());
  });

  it('are the defaults for nothing, and keep what is valid and drop what is not', () => {
    expect(parseGlobalOptions(null)).toEqual(DEFAULT_GLOBAL_OPTIONS);
    const o = parseGlobalOptions({
      music: 3,
      sfx: 99,
      audio: 2,
      musicVersion: -1,
      text: 1,
      motion: 'full',
      fullscreen: 2,
      awake: false,
      density: 7,
      rumble: 1,
      rumblePads: { '1118:2834': 2, nope: 3, '1356:3302': 9 },
      captions: false,
    });
    expect(o).toMatchObject({
      music: 3,
      sfx: METER_BLOCKS,
      audio: 2,
      musicVersion: 0,
      text: 1,
      motion: 0,
      fullscreen: 2,
      awake: false,
      density: 1,
      rumble: 1,
    });
    expect(o.rumblePads).toEqual({ '1118:2834': 2 });
    expect('captions' in o).toBe(false);
  });

  it("do not share the defaults' object between callers", () => {
    const a = parseGlobalOptions(null);
    a.rumblePads['1118:2834'] = 1;
    expect(parseGlobalOptions(null).rumblePads).toEqual({});
  });
});

describe('stepping a shared option', () => {
  const o = DEFAULT_GLOBAL_OPTIONS;

  it('clamps a meter, and wraps it when asked', () => {
    expect(stepGlobalOption(o, 'music', 1).music).toBe(METER_BLOCKS);
    expect(stepGlobalOption(o, 'music', -3).music).toBe(5);
    expect(stepGlobalOption({ ...o, sfx: 0 }, 'sfx', -1).sfx).toBe(0);
    expect(stepGlobalOption(o, 'music', 1, true).music).toBe(0);
    expect(stepGlobalOption({ ...o, sfx: 0 }, 'sfx', -1, true).sfx).toBe(METER_BLOCKS);
  });

  it('wraps a choice round, and flips a switch', () => {
    expect(stepGlobalOption(o, 'audio', 1).audio).toBe(1);
    expect(stepGlobalOption({ ...o, audio: 2 }, 'audio', 1).audio).toBe(0);
    expect(stepGlobalOption(o, 'audio', -1).audio).toBe(2);
    expect(stepGlobalOption(o, 'awake', 1).awake).toBe(false);
    expect(stepGlobalOption(o, 'text', 1).text).toBe(1);
    expect(stepGlobalOption(o, 'rumble', 1).rumble).toBe(0);
    expect(stepGlobalOption(o, 'density', -2).density).toBe(2);
  });

  it('does not change what it was given', () => {
    stepGlobalOption(o, 'music', -1);
    expect(o.music).toBe(METER_BLOCKS);
  });
});
