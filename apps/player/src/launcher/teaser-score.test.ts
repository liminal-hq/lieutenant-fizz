// Tests for the launcher's teaser score.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { loopCycles } from '@lieutenant-fizz/engine/music-songs';
import { TEASER_LOOP, TEASER_SONG } from './teaser-score';

describe('the teaser score', () => {
  it('is a slow loop of eight bars with a bass, a lead, bells and a pad', () => {
    expect(TEASER_LOOP.bpm).toBeLessThan(90);
    expect(loopCycles(TEASER_LOOP)).toBe(8);
    const roles = TEASER_LOOP.parts.map((p) => p.role);
    for (const role of ['pad', 'bass', 'lead', 'bell']) expect(roles).toContain(role);
  });

  it('stays quiet enough for several parts to sum under full scale', () => {
    const total = TEASER_LOOP.parts.reduce((sum, p) => sum + p.g, 0);
    expect(total).toBeLessThan(0.8);
  });

  it('becomes a song of about a minute, at the same tempo, with the engine’s stereo partners', () => {
    expect(TEASER_SONG.bpm).toBe(TEASER_LOOP.bpm);
    const seconds = (TEASER_SONG.cycles.reduce((a, b) => a + b, 0) * 240) / TEASER_SONG.bpm;
    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(90);
    const parts = TEASER_SONG.streams.flat().filter((p) => p !== null);
    expect(parts.some((p) => p!.mirror !== undefined)).toBe(true);
    for (const stream of TEASER_SONG.streams)
      expect(stream).toHaveLength(TEASER_SONG.cycles.length);
  });
});
