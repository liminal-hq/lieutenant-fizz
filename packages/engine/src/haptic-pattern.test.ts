// Tests for the haptic pattern compiler: taps, hums, gaps, clipping and the silence floor.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  VIBRATE_COMPILE,
  calmPattern,
  compileRumble,
  compileVibrate,
  onTime,
  patternLength,
  readEvents,
  sampleCurve,
  type HapticPattern,
} from './haptic-pattern';

const tap = (intensity: number, sharpness: number, at = 0): HapticPattern['events'][number] => ({
  kind: 'transient',
  at,
  intensity,
  sharpness,
});
const ramp = (at: number, duration: number, from: number, to: number, sharpness = 0.5) =>
  ({
    kind: 'continuous',
    at,
    duration,
    intensity: [
      { t: 0, v: from },
      { t: duration, v: to },
    ],
    sharpness,
  }) as const;

describe('compileVibrate worked examples', () => {
  const cases: [string, HapticPattern, number, number[]][] = [
    ['jump', { events: [tap(0.5, 0.7)] }, 1, [15]],
    ['jump at Light (0.5)', { events: [tap(0.5, 0.7)] }, 0.5, [11]],
    ['jump at 0.3 is under the floor', { events: [tap(0.5, 0.7)] }, 0.3, []],
    ['fzzt', { events: [tap(0.35, 0.9)] }, 1, [12]],
    ['bonk', { events: [tap(0.7, 0.2)] }, 1, [21]],
    [
      'whoa: a tap, then a hum fading from 0.9',
      { events: [tap(1, 0.6), ramp(25, 120, 0.9, 0, 0.1)] },
      1,
      [59, 6, 11, 9, 8, 12, 6],
    ],
  ];
  for (const [name, pattern, scale, want] of cases)
    it(name, () => expect(compileVibrate(pattern, scale)).toEqual(want));
});

describe('compileVibrate rules', () => {
  it('starts with a 0 when the first pulse is not at the start', () => {
    expect(compileVibrate({ events: [tap(0.7, 0.2, 30)] })).toEqual([0, 30, 21]);
  });

  it('keeps a gap of at least minOff and fills a shorter one', () => {
    // Two 21 ms bonks: ends at 21; the second starts 4 ms later (kept) or 3 ms later (filled).
    expect(compileVibrate({ events: [tap(0.7, 0.2), tap(0.7, 0.2, 25)] })).toEqual([21, 4, 21]);
    expect(compileVibrate({ events: [tap(0.7, 0.2), tap(0.7, 0.2, 24)] })).toEqual([45]);
  });

  it('merges overlapping events into one run', () => {
    expect(compileVibrate({ events: [tap(0.7, 0.2), tap(0.7, 0.2, 10)] })).toEqual([31]);
  });

  it('fills a hum slice when it is strong and gives a weaker one a share of the slice', () => {
    const strong = compileVibrate({ events: [ramp(0, 60, 1, 1)] });
    expect(strong).toEqual([60]);
    // A constant 0.5 hum: 10 of every 20 ms.
    expect(compileVibrate({ events: [ramp(0, 60, 0.5, 0.5)] })).toEqual([10, 10, 10, 10, 10]);
  });

  it('never sends a pulse shorter than minOn', () => {
    // 0.2 of a 20 ms slice is 4 ms: raised to the 6 ms minimum.
    expect(compileVibrate({ events: [ramp(0, 20, 0.2, 0.2)] })).toEqual([6]);
    const pulses = compileVibrate({ events: [ramp(0, 400, 0.3, 0.3)] }).filter(
      (_, i) => i % 2 === 0,
    );
    expect(Math.min(...pulses)).toBeGreaterThanOrEqual(VIBRATE_COMPILE.minOn);
  });

  it('plays nothing below the floor', () => {
    expect(compileVibrate({ events: [tap(0.15, 0.5), ramp(0, 100, 0.1, 0.1)] })).toEqual([]);
  });

  it('clips at maxMs and drops the trailing off', () => {
    const out = compileVibrate({ events: [ramp(0, 3000, 1, 1)] });
    expect(out).toEqual([1000]);
    const late = compileVibrate({ events: [tap(1, 0.5), tap(1, 0.5, 1500)] });
    expect(late.length % 2).toBe(1);
    expect(late.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000);
  });

  it('scales a hum by the master strength', () => {
    const a = compileVibrate({ events: [ramp(0, 100, 0.6, 0.6)] }, 1);
    const b = compileVibrate({ events: [ramp(0, 100, 0.6, 0.6)] }, 0.5);
    expect(onTime(b)).toBeLessThan(onTime(a));
  });

  it('honours tuned constants', () => {
    expect(
      compileVibrate({ events: [tap(0.2, 0.5)] }, 1, { ...VIBRATE_COMPILE, floor: 0.3 }),
    ).toEqual([]);
  });
});

describe('helpers', () => {
  it('samples a curve linearly and clamps the ends', () => {
    const c = [
      { t: 0, v: 0 },
      { t: 100, v: 1 },
    ];
    expect(sampleCurve(c, -5)).toBe(0);
    expect(sampleCurve(c, 25)).toBeCloseTo(0.25);
    expect(sampleCurve(c, 500)).toBe(1);
    expect(sampleCurve(0.4, 10)).toBe(0.4);
    expect(sampleCurve([], 10)).toBe(0);
  });

  it('measures a pattern', () => {
    expect(patternLength({ events: [tap(1, 1, 80), ramp(20, 100, 1, 1)] })).toBe(120);
    expect(onTime([10, 5, 20, 5])).toBe(30);
  });
});

describe('calmPattern', () => {
  it('squeezes a long hum into the cap and leaves taps and short hums alone', () => {
    const long = ramp(0, 300, 1, 0.2);
    const calm = calmPattern({ events: [tap(0.5, 0.5, 10), long] });
    const hum = calm.events[1];
    expect(calm.events[0]).toEqual(tap(0.5, 0.5, 10));
    expect(hum).toMatchObject({ kind: 'continuous', duration: 150 });
    if (hum?.kind === 'continuous' && typeof hum.intensity !== 'number')
      expect(hum.intensity.map((p) => p.t)).toEqual([0, 150]);
    const short = ramp(0, 100, 1, 0);
    expect(calmPattern({ events: [short] }).events[0]).toBe(short);
    expect(onTime(compileVibrate(calmPattern({ events: [long] })))).toBeLessThan(
      onTime(compileVibrate({ events: [long] })),
    );
  });
});

describe('readEvents', () => {
  const good = [
    { kind: 'transient', at: 0, intensity: 0.5, sharpness: 0.5 },
    { kind: 'continuous', at: 20, duration: 100, intensity: 0.4, sharpness: 0.2 },
    {
      kind: 'continuous',
      at: 0,
      duration: 100,
      intensity: [
        { t: 0, v: 1 },
        { t: 100, v: 0 },
      ],
      sharpness: 0.5,
    },
  ];
  it('returns a clean copy of good events', () => {
    const out = readEvents(good);
    expect(out).toEqual(good);
    expect(out).not.toBe(good);
  });
  it('rejects anything out of range or malformed', () => {
    const bad: unknown[] = [
      [],
      'x',
      [{ kind: 'transient', at: 0, intensity: 1.5, sharpness: 0.5 }],
      [{ kind: 'transient', at: -1, intensity: 0.5, sharpness: 0.5 }],
      [{ kind: 'transient', at: 0, intensity: 0.5 }],
      [{ kind: 'continuous', at: 0, duration: 5, intensity: 0.5, sharpness: 0.5 }],
      [{ kind: 'continuous', at: 0, duration: 100, intensity: [{ t: 0, v: 1 }], sharpness: 0.5 }],
      [{ kind: 'wobble', at: 0 }],
      Array.from({ length: 9 }, () => good[0]),
    ];
    for (const b of bad) expect(readEvents(b), JSON.stringify(b)).toBeNull();
  });
});

describe('compileRumble', () => {
  it('turns a tap into one segment, the low motor for a dull thud and the high one for a click', () => {
    expect(compileRumble({ events: [tap(0.7, 0.2)] })).toEqual([
      { at: 0, duration: 68, strong: 0.56, weak: 0.14 },
    ]);
    expect(compileRumble({ events: [tap(1, 1, 30)] })).toEqual([
      { at: 30, duration: 80, strong: 0, weak: 1 },
    ]);
  });

  it('scales strength and plays nothing under the floor', () => {
    expect(compileRumble({ events: [tap(0.7, 0.2)] }, 0.5)).toEqual([
      { at: 0, duration: 54, strong: 0.28, weak: 0.07 },
    ]);
    expect(compileRumble({ events: [tap(0.04, 0.5)] })).toEqual([]);
    expect(compileRumble({ events: [] })).toEqual([]);
  });

  it('cuts a hum into slices of at least 40 ms sampled in the middle', () => {
    const out = compileRumble({ events: [ramp(0, 120, 0.9, 0, 0)] });
    expect(out.map((s) => [s.at, s.duration, s.strong])).toEqual([
      [0, 40, 0.75],
      [40, 40, 0.45],
      [80, 40, 0.15],
    ]);
  });

  it('merges neighbouring slices that are nearly the same', () => {
    expect(compileRumble({ events: [ramp(0, 200, 0.5, 0.5, 0)] })).toEqual([
      { at: 0, duration: 200, strong: 0.5, weak: 0 },
    ]);
  });

  it('lets a later segment take over from an earlier one it overlaps', () => {
    // The whoa: a tap, then a hum that begins 25 ms in.
    const out = compileRumble({ events: [tap(1, 0.6), ramp(25, 120, 0.9, 0, 0.1)] });
    expect(out[0]).toEqual({ at: 0, duration: 25, strong: 0.4, weak: 0.6 });
    expect(out[1]?.at).toBe(25);
    expect(out).toHaveLength(4);
  });

  it('keeps a long hum to eight segments and the whole pattern to a second', () => {
    const out = compileRumble({ events: [ramp(0, 1000, 1, 0.1, 0)] });
    expect(out.length).toBeLessThanOrEqual(8);
    const end = out[out.length - 1];
    expect((end?.at ?? 0) + (end?.duration ?? 0)).toBeLessThanOrEqual(1000);
    expect(compileRumble({ events: [tap(1, 0, 1500)] })).toEqual([]);
    const late = compileRumble({ events: [tap(1, 0, 980)] });
    expect(late[0]?.duration).toBe(20);
  });

  it('never makes a segment longer than 1000 ms', () => {
    for (const s of compileRumble({ events: [ramp(0, 1000, 1, 1, 0)] }))
      expect(s.duration).toBeLessThanOrEqual(1000);
  });
});
