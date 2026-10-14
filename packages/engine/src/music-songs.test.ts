// Tests for the Enhanced music: rewriting notes, the song for each cue, and its depth.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { arpeggiate, loopCycles, rootsOnly, transposeNotes } from './music-songs';

describe('rewriting notes', () => {
  it('transposes note names and leaves rests, noise and a zero shift alone', () => {
    expect(transposeNotes('c4 [e4 g4] ~ white*4', 2)).toBe('d4 [f#4 a4] ~ white*4');
    expect(transposeNotes('b3 c4', 1)).toBe('c4 c#4');
    expect(transposeNotes('a2 c1', -12)).toBe('a1 c0');
    expect(transposeNotes('c4', 0)).toBe('c4');
  });

  it('reduces a bass line to the first note of each bar', () => {
    expect(rootsOnly('[a2 a2 c3 e3] [d2 d2 f2 a2]')).toBe('a2 d2');
  });

  it('spreads a block chord into eight notes up and back down', () => {
    expect(arpeggiate('[c4,e4,g4]')).toBe('[c4 e4 g4 e4 c4 e4 g4 e4]');
  });
});

describe('loopCycles', () => {
  it('finds the length after which a track repeats', () => {
    expect(loopCycles({ bpm: 120, parts: [{ notes: 'c4 e4', g: 0.1 }] })).toBe(1);
    expect(loopCycles({ bpm: 120, parts: [{ notes: '<c4 e4> g4', g: 0.1 }] })).toBe(2);
    expect(
      loopCycles({
        bpm: 120,
        parts: [
          { notes: '<c4 e4> g4', g: 0.1 },
          { notes: '<a3 b3 c4> g3', g: 0.1 },
        ],
      }),
    ).toBe(6);
  });
});
