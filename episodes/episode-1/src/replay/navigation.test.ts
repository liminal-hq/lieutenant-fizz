// Tests for the replay screen's pure helpers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Input } from '../sim/protocol';
import {
  DEATH_LEAD,
  clockText,
  deathTargets,
  driftText,
  inputText,
  nextTarget,
} from './navigation';
import type { Marker } from './timeline';

describe('clockText', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(clockText(0)).toBe('0:00.0');
    expect(clockText(60 * 12 + 24)).toBe('0:12.4');
    expect(clockText(60 * 75)).toBe('1:15.0');
    expect(clockText(-5)).toBe('0:00.0');
  });
});

describe('death targets', () => {
  const markers: Marker[] = [
    { tick: 1000, kind: 'death', text: 'Spikes' },
    { tick: 50, kind: 'death', text: 'Fell' },
    { tick: 600, kind: 'pause', text: 'Paused' },
  ];

  it('lands a lead before each death, in order, never before the start', () => {
    expect(deathTargets(markers, 0)).toEqual([0, 1000 - DEATH_LEAD]);
    expect(deathTargets(markers, 20)).toEqual([20, 1000 - DEATH_LEAD]);
  });

  it('goes to the next target after the tick, and back to the last one before it', () => {
    const targets = [100, 400, 900];
    expect(nextTarget(targets, 0, 1)).toBe(100);
    expect(nextTarget(targets, 100, 1)).toBe(400);
    expect(nextTarget(targets, 899, 1)).toBeNull();
    expect(nextTarget(targets, 900, -1)).toBe(400);
    expect(nextTarget(targets, 100, -1)).toBeNull();
    // Just after a jump to a target, going back leaves it for the one before.
    expect(nextTarget(targets, 401, -1)).toBe(100);
  });
});

describe('inputText', () => {
  it('names the buttons held', () => {
    expect(inputText(0)).toBe('');
    expect(inputText(Input.RIGHT | Input.JUMP)).toBe('Right, Jump');
    expect(inputText(Input.FIRE)).toBe('Fizz');
  });
});

describe('driftText', () => {
  it('says where it stopped matching and that the rest is the game’s own run', () => {
    const text = driftText(
      { tick: 4800, kind: 'pos', recorded: '41.2, 9', replayed: '40.4, 9.00' },
      4517,
    );
    expect(text).toContain('0:04.7 into this try');
    expect(text).toContain('40.4, 9.00');
    expect(text).toContain('41.2, 9');
    expect(text).toContain('the game’s own run');
  });

  it('words each kind of mismatch', () => {
    for (const kind of ['st', 'death', 'clear'] as const) {
      expect(driftText({ tick: 10, kind, recorded: 'a', replayed: 'b' }, 0)).toContain(
        `is b where the recording has a`,
      );
    }
  });
});
