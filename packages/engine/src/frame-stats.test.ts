// Tests for the rolling frame-time statistics.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { FrameStats, LONG_FRAME_MS, PERF_GAP_MS, percentile } from './frame-stats';

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 0.5)).toBe(5);
    expect(percentile(s, 0.95)).toBe(10);
    expect(percentile(s, 0)).toBe(1);
    expect(percentile(s, 1)).toBe(10);
  });
  it('is zero for an empty list', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('FrameStats', () => {
  it('reports zeros while empty', () => {
    expect(new FrameStats().report()).toEqual({
      frames: 0,
      window: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      long: 0,
      max: 0,
    });
  });

  it('handles a window of one and a short window', () => {
    const f = new FrameStats();
    f.push(16);
    expect(f.report()).toMatchObject({ window: 1, p50: 16, p95: 16, p99: 16, max: 16, long: 0 });
    f.push(40);
    f.push(17);
    const r = f.report();
    expect(r.window).toBe(3);
    expect(r.p50).toBe(17);
    expect(r.p99).toBe(40);
    expect(r.long).toBe(1);
  });

  it('computes percentiles over a hundred frames', () => {
    const f = new FrameStats();
    for (let i = 1; i <= 100; i++) f.push(i);
    const r = f.report();
    expect([r.p50, r.p95, r.p99, r.max]).toEqual([50, 95, 99, 100]);
    expect(r.long).toBe(100 - LONG_FRAME_MS);
  });

  it('keeps only the newest frames once the ring wraps, and counts all of them', () => {
    const f = new FrameStats(4);
    for (const v of [100, 100, 100, 100, 1, 2, 3, 4]) f.push(v);
    const r = f.report();
    expect(r.window).toBe(4);
    expect(r.frames).toBe(8);
    expect(r.max).toBe(4);
    expect(r.p50).toBe(2);
    expect(r.long).toBe(0);
  });

  it('does not disturb the window when it reports', () => {
    const f = new FrameStats(4);
    for (const v of [4, 3, 2, 1, 9]) f.push(v);
    expect(f.report()).toEqual(f.report());
    f.push(8);
    expect(f.report().max).toBe(9);
  });

  it('ignores values that are not times', () => {
    const f = new FrameStats();
    f.push(NaN);
    f.push(-1);
    f.push(Infinity);
    expect(f.report().frames).toBe(0);
  });

  it('turns timestamps into intervals, skipping the first and a hidden-page gap', () => {
    const f = new FrameStats();
    f.frame(1000);
    expect(f.report().window).toBe(0);
    f.frame(1016);
    f.frame(1033);
    f.frame(1033 + PERF_GAP_MS + 1);
    f.frame(1033 + PERF_GAP_MS + 18);
    const r = f.report();
    expect(r.window).toBe(3);
    expect(r.max).toBe(17);
  });

  it('starts fresh after a reset', () => {
    const f = new FrameStats();
    f.frame(0);
    f.frame(16);
    f.reset();
    expect(f.report().frames).toBe(0);
    f.frame(5000);
    expect(f.report().window).toBe(0);
    f.frame(5016);
    expect(f.report()).toMatchObject({ frames: 1, window: 1, p50: 16 });
  });
});
