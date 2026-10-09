// Tests for parsing, saving and applying the touch control settings.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOUCH_SETTINGS,
  TOUCH_KEY,
  parseTouchSettings,
  readTouchSettings,
  resetPositions,
  serialiseTouchSettings,
  touchSpec,
  withPosition,
  writeTouchSettings,
  type TouchSettings,
} from './touch-settings';
import { DEFAULT_TOUCH_SPEC } from './touch-layout';

const v1 = (o: Record<string, unknown>): string => JSON.stringify({ v: 1, ...o });

describe('parseTouchSettings', () => {
  it('gives the defaults for nothing, bad JSON, a non-object or another version', () => {
    for (const json of [null, '', '{', 'null', '7', '"x"', '{"v":2,"size":"L"}', '{"size":"L"}']) {
      expect(parseTouchSettings(json), String(json)).toEqual(DEFAULT_TOUCH_SETTINGS);
    }
  });

  it('defaults to Medium, 85%, right-handed, Strong haptics and nothing moved', () => {
    expect(DEFAULT_TOUCH_SETTINGS).toEqual({
      size: 'M',
      opacity: 85,
      leftHanded: false,
      hapticStrength: 3,
      pos: {},
    });
  });

  it('returns a fresh object each time', () => {
    const a = parseTouchSettings(null);
    a.pos.dpad = { side: 1, bottom: 1 };
    expect(parseTouchSettings(null).pos).toEqual({});
    expect(DEFAULT_TOUCH_SETTINGS.pos).toEqual({});
  });

  it('falls back to Medium for an unknown size', () => {
    expect(parseTouchSettings(v1({ size: 'XL' })).size).toBe('M');
    expect(parseTouchSettings(v1({ size: 2 })).size).toBe('M');
    expect(parseTouchSettings(v1({ size: 'S' })).size).toBe('S');
    expect(parseTouchSettings(v1({ size: 'L' })).size).toBe('L');
  });

  it('snaps opacity to the nearest step (40, 60, 85, 100) and defaults a non-number', () => {
    expect(parseTouchSettings(v1({ opacity: 40 })).opacity).toBe(40);
    expect(parseTouchSettings(v1({ opacity: 52 })).opacity).toBe(60);
    expect(parseTouchSettings(v1({ opacity: 0 })).opacity).toBe(40);
    expect(parseTouchSettings(v1({ opacity: 500 })).opacity).toBe(100);
    expect(parseTouchSettings(v1({ opacity: 70 })).opacity).toBe(60);
    expect(parseTouchSettings(v1({ opacity: 80 })).opacity).toBe(85);
    // Halfway between two steps takes the lower one.
    expect(parseTouchSettings(v1({ opacity: 50 })).opacity).toBe(40);
    expect(parseTouchSettings(v1({ opacity: 72.5 })).opacity).toBe(60);
    expect(parseTouchSettings(v1({ opacity: 92.5 })).opacity).toBe(85);
    expect(parseTouchSettings(v1({ opacity: '40' })).opacity).toBe(85);
    expect(parseTouchSettings(v1({ opacity: null })).opacity).toBe(85);
    expect(parseTouchSettings('{"v":1,"opacity":1e999}').opacity).toBe(85);
  });

  it('accepts only a real boolean for the hand', () => {
    expect(parseTouchSettings(v1({ leftHanded: true }))).toMatchObject({ leftHanded: true });
    expect(parseTouchSettings(v1({ leftHanded: 'true' })).leftHanded).toBe(false);
    expect(parseTouchSettings(v1({ leftHanded: 1 })).leftHanded).toBe(false);
  });

  it('reads the haptic strength, and falls back to Strong for anything else', () => {
    for (const level of [0, 1, 2, 3])
      expect(parseTouchSettings(v1({ hapticStrength: level })).hapticStrength).toBe(level);
    for (const bad of [4, -1, 1.5, '2', null, true, 'loud', Number.NaN, [2]])
      expect(parseTouchSettings(v1({ hapticStrength: bad })).hapticStrength, String(bad)).toBe(3);
  });

  it('reads the boolean an older save kept: false is Off, anything else is Strong', () => {
    expect(parseTouchSettings(v1({ haptics: false })).hapticStrength).toBe(0);
    expect(parseTouchSettings(v1({ haptics: true })).hapticStrength).toBe(3);
    expect(parseTouchSettings(v1({ haptics: 'false' })).hapticStrength).toBe(3);
    expect(parseTouchSettings(v1({ haptics: 0 })).hapticStrength).toBe(3);
    // A strength, when there is one, wins over the old boolean.
    expect(parseTouchSettings(v1({ haptics: false, hapticStrength: 2 })).hapticStrength).toBe(2);
    expect(parseTouchSettings(v1({ haptics: false, hapticStrength: 'x' })).hapticStrength).toBe(3);
  });

  it('loads an old save unchanged apart from the strength', () => {
    const old = v1({ size: 'L', opacity: 40, leftHanded: true, haptics: false, pos: {} });
    expect(parseTouchSettings(old)).toEqual({
      size: 'L',
      opacity: 40,
      leftHanded: true,
      hapticStrength: 0,
      pos: {},
    });
  });

  it('keeps only valid movable positions, rounded', () => {
    const s = parseTouchSettings(
      v1({
        pos: {
          dpad: { side: 75.4, bottom: 114.6 },
          jump: { side: 0, bottom: 2000 },
          pogo: { side: Number.NaN, bottom: 5 },
          fire: { side: 1e9, bottom: 5 },
          pause: { side: 5, bottom: 5 },
          other: { side: 5, bottom: 5 },
        },
      }),
    );
    expect(s.pos).toEqual({ dpad: { side: 75, bottom: 115 }, jump: { side: 0, bottom: 2000 } });
  });

  it('drops positions that are not two finite in-range numbers', () => {
    const bad = [
      { side: 'x', bottom: 5 },
      { side: 5 },
      { side: -1, bottom: 5 },
      { side: 5, bottom: 2001 },
      { side: null, bottom: 5 },
      '12',
      null,
      [1, 2],
    ];
    for (const b of bad) {
      expect(parseTouchSettings(v1({ pos: { dpad: b } })).pos, JSON.stringify(b)).toEqual({});
    }
    // JSON cannot hold NaN or Infinity, but a huge literal parses to Infinity.
    expect(parseTouchSettings('{"v":1,"pos":{"dpad":{"side":1e999,"bottom":5}}}').pos).toEqual({});
  });

  it('ignores a pos that is not an object', () => {
    for (const pos of [null, 'x', 5, true]) {
      expect(parseTouchSettings(v1({ pos })).pos).toEqual({});
    }
  });

  it('survives a round trip', () => {
    const s: TouchSettings = {
      size: 'L',
      opacity: 40,
      leftHanded: true,
      hapticStrength: 1,
      pos: { dpad: { side: 75, bottom: 115 }, fire: { side: 10, bottom: 20 } },
    };
    expect(parseTouchSettings(serialiseTouchSettings(s))).toEqual(s);
  });
});

describe('serialiseTouchSettings', () => {
  it('writes the version and the known fields only', () => {
    const json = serialiseTouchSettings({
      ...DEFAULT_TOUCH_SETTINGS,
      pos: { dpad: { side: 75, bottom: 115 } },
      extra: 1,
    } as TouchSettings);
    expect(json).toBe(
      '{"v":1,"size":"M","opacity":85,"leftHanded":false,"hapticStrength":3,"pos":{"dpad":{"side":75,"bottom":115}}}',
    );
  });
});

describe('storage', () => {
  it('reads and writes under the touch key', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const s = { ...DEFAULT_TOUCH_SETTINGS, size: 'S' as const, pos: {} };
    expect(writeTouchSettings(store, s)).toBe(true);
    expect([...data.keys()]).toEqual([TOUCH_KEY]);
    expect(readTouchSettings(store)).toEqual(s);
  });

  it('gives the defaults, and never writes, when reading finds nothing or throws', () => {
    let writes = 0;
    const empty = { getItem: () => null, setItem: () => void writes++ };
    expect(readTouchSettings(empty)).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(readTouchSettings(null)).toEqual(DEFAULT_TOUCH_SETTINGS);
    const throwing = {
      getItem: (): string => {
        throw new Error('blocked');
      },
    };
    expect(readTouchSettings(throwing)).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(writes).toBe(0);
  });

  it('returns false when there is no storage or writing throws', () => {
    expect(writeTouchSettings(null, DEFAULT_TOUCH_SETTINGS)).toBe(false);
    const full = {
      setItem: (): void => {
        throw new Error('quota');
      },
    };
    expect(writeTouchSettings(full, DEFAULT_TOUCH_SETTINGS)).toBe(false);
  });
});

describe('touchSpec', () => {
  it('maps the size, the hand and the moved controls onto the spec', () => {
    const pos = { dpad: { side: 75, bottom: 115 } };
    const spec = touchSpec({ ...DEFAULT_TOUCH_SETTINGS, size: 'L', leftHanded: true, pos });
    expect(spec.scale).toBe(1.2);
    expect(spec.leftHanded).toBe(true);
    expect(spec.moved).toEqual(pos);
    expect(spec.dpad).toEqual(DEFAULT_TOUCH_SPEC.dpad);
    expect(touchSpec({ ...DEFAULT_TOUCH_SETTINGS, size: 'S' }).scale).toBe(0.85);
    expect(touchSpec(DEFAULT_TOUCH_SETTINGS).scale).toBe(1);
  });

  it('does not share the position map with the settings', () => {
    const s = withPosition(DEFAULT_TOUCH_SETTINGS, 'jump', { side: 1, bottom: 2 });
    const spec = touchSpec(s);
    expect(spec.moved).not.toBe(s.pos);
  });
});

describe('withPosition and resetPositions', () => {
  it('moves one control without touching the others or the original', () => {
    const a = withPosition(DEFAULT_TOUCH_SETTINGS, 'dpad', { side: 75, bottom: 115 });
    const b = withPosition(a, 'jump', { side: 30, bottom: 40 });
    expect(a.pos).toEqual({ dpad: { side: 75, bottom: 115 } });
    expect(b.pos).toEqual({ dpad: { side: 75, bottom: 115 }, jump: { side: 30, bottom: 40 } });
    expect(DEFAULT_TOUCH_SETTINGS.pos).toEqual({});
  });

  it('puts every control back and keeps the other settings', () => {
    const s = {
      ...withPosition(DEFAULT_TOUCH_SETTINGS, 'dpad', { side: 1, bottom: 1 }),
      size: 'L' as const,
    };
    expect(resetPositions(s)).toEqual({ ...DEFAULT_TOUCH_SETTINGS, size: 'L' });
  });
});
