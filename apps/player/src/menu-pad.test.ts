// Tests for the menu's gamepad intent mapping, repeat timing and polling step.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  initialPadState,
  nextFocus,
  pollPads,
  stepPad,
  type PadIntent,
  type PadSnapshot,
  type PadState,
} from './menu-pad';

const pad = (pressed: number[] = [], y = 0): PadSnapshot => ({
  buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)),
  axes: [0, y, 0, 0],
});

const awake = (): PadState => ({ ...initialPadState(), awake: true });

describe('stepPad', () => {
  it('only wakes on the first press, then acts on later ones', () => {
    const first = stepPad(initialPadState(), pad([13]), 0);
    expect(first.intent).toBe('wake');
    const second = stepPad(first.state, pad(), 10);
    const third = stepPad(second.state, pad([13]), 20);
    expect(third.intent).toBe('down');
  });

  it('maps the D-pad and the left stick to up and down', () => {
    expect(stepPad(awake(), pad([12]), 0).intent).toBe('up');
    expect(stepPad(awake(), pad([13]), 0).intent).toBe('down');
    expect(stepPad(awake(), pad([], -0.7), 0).intent).toBe('up');
    expect(stepPad(awake(), pad([], 0.7), 0).intent).toBe('down');
    expect(stepPad(awake(), pad([], 0.5), 0).intent).toBeNull();
  });

  it('ignores opposing directions held together', () => {
    expect(stepPad(awake(), pad([12, 13]), 0).intent).toBeNull();
  });

  it('repeats after 350 ms, then every 120 ms', () => {
    let s = awake();
    const times: number[] = [];
    for (let t = 0; t <= 900; t += 10) {
      const r = stepPad(s, pad([13]), t);
      s = r.state;
      if (r.intent) times.push(t);
    }
    expect(times).toEqual([0, 350, 470, 590, 710, 830]);
  });

  it('moves again at once after release and a new push', () => {
    let s = stepPad(awake(), pad([13]), 0).state;
    s = stepPad(s, pad(), 50).state;
    expect(stepPad(s, pad([13]), 60).intent).toBe('down');
  });

  it('fires A and B once per press', () => {
    let r = stepPad(awake(), pad([0]), 0);
    expect(r.intent).toBe('activate');
    r = stepPad(r.state, pad([0]), 16);
    expect(r.intent).toBeNull();
    r = stepPad(awake(), pad([1]), 0);
    expect(r.intent).toBe('back');
  });
});

describe('pollPads', () => {
  it('keeps state per pad slot and skips empty slots', () => {
    const states: PadState[] = [];
    const seen: PadIntent[] = [];
    const host = {
      getPads: () => [null, pad([13])],
      onIntent: (i: Exclude<PadIntent, null>) => seen.push(i),
    };
    pollPads(states, host, 0);
    expect(seen).toEqual(['wake']);
    expect(states[0]).toBeUndefined();
    pollPads(states, host, 16);
    expect(seen).toEqual(['wake']);
  });
});

describe('nextFocus', () => {
  it('starts at the ends and wraps', () => {
    expect(nextFocus(-1, 5, 1)).toBe(0);
    expect(nextFocus(-1, 5, -1)).toBe(4);
    expect(nextFocus(4, 5, 1)).toBe(0);
    expect(nextFocus(0, 5, -1)).toBe(4);
    expect(nextFocus(0, 0, 1)).toBe(-1);
  });
});
