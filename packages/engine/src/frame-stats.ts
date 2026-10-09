// Rolling frame-time statistics (median, 95th and 99th percentile, long frames) for the debug page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How many recent frame times the window keeps. */
export const PERF_WINDOW = 600;

/** A frame longer than this many milliseconds counts as long (a missed frame at 60 Hz is 33 ms). */
export const LONG_FRAME_MS = 25;

/** A gap longer than this many milliseconds is a hidden or suspended page, not a slow frame; it is not recorded. */
export const PERF_GAP_MS = 1000;

/** What `FrameStats.report()` returns. Times are milliseconds. */
export interface PerfReport {
  /** Frames recorded since the last reset, including those that have left the window. */
  frames: number;
  /** Frames in the window (up to `PERF_WINDOW`). */
  window: number;
  p50: number;
  p95: number;
  p99: number;
  /** Frames in the window longer than `LONG_FRAME_MS`. */
  long: number;
  /** The longest frame in the window. */
  max: number;
}

/**
 * A fixed ring of the most recent frame times. `push` and `frame` never allocate; `report` copies
 * and sorts the window, so call it on demand and not every frame.
 */
export class FrameStats {
  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private head = 0;
  private count = 0;
  private total = 0;
  private lastT = -1;

  constructor(readonly capacity: number = PERF_WINDOW) {
    this.ring = new Float32Array(capacity);
    this.scratch = new Float32Array(capacity);
  }

  /** Records one frame time in milliseconds. A non-finite or negative value is ignored. */
  push(ms: number): void {
    if (!(ms >= 0) || !Number.isFinite(ms)) return;
    this.ring[this.head] = ms;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.total++;
  }

  /**
   * Records the time since the previous call, given the frame's timestamp in milliseconds. The
   * first call after a reset only sets the reference, and a gap over `PERF_GAP_MS` (a hidden page)
   * is skipped.
   */
  frame(nowMs: number): void {
    const last = this.lastT;
    this.lastT = nowMs;
    if (last < 0) return;
    const dt = nowMs - last;
    if (dt > PERF_GAP_MS) return;
    this.push(dt);
  }

  /** Starts a fresh window. */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.total = 0;
    this.lastT = -1;
  }

  /** The statistics for the window; all zero while it is empty. */
  report(): PerfReport {
    const n = this.count;
    if (n === 0) return { frames: this.total, window: 0, p50: 0, p95: 0, p99: 0, long: 0, max: 0 };
    const s = this.scratch.subarray(0, n);
    // Until the ring wraps the samples start at 0; once full every slot is live.
    s.set(n < this.capacity ? this.ring.subarray(0, n) : this.ring);
    s.sort();
    let long = 0;
    for (let i = 0; i < n; i++) if ((s[i] ?? 0) > LONG_FRAME_MS) long++;
    return {
      frames: this.total,
      window: n,
      p50: percentile(s, 0.5),
      p95: percentile(s, 0.95),
      p99: percentile(s, 0.99),
      long,
      max: s[n - 1] ?? 0,
    };
  }
}

/** The nearest-rank percentile `q` (0 to 1) of an ascending, non-empty list. */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const rank = Math.ceil(q * n);
  return sorted[Math.min(n - 1, Math.max(0, rank - 1))] ?? 0;
}
