// Tests for the Back peek's look and its state.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  BackPeek,
  PEEK_FEATHER_FRACTION,
  PEEK_PARENT_HIDDEN_BELOW,
  PEEK_SETTLE_MS,
  PEEK_SLIDE_PERCENT,
  PEEK_TIMEOUT_MS,
  peekStyle,
  type PeekClock,
  type PeekHost,
  type PeekStyle,
} from './back-peek';

describe('peekStyle', () => {
  it('is exactly the rest state at progress 0', () => {
    for (const edge of ['left', 'right'] as const) {
      expect(peekStyle(0, edge, false)).toEqual({
        translateXPercent: 0,
        opacity: 1,
        feather: 0,
        featherEdge: edge,
        parentOpacity: 0,
        backdrop: 0,
      });
      expect(Object.is(peekStyle(0, edge, false).translateXPercent, 0)).toBe(true);
    }
  });

  it('slides with the swipe and fades part of the way at the middle', () => {
    const left = peekStyle(0.5, 'left', false);
    const right = peekStyle(0.5, 'right', false);
    expect(left.translateXPercent).toBeGreaterThan(0);
    expect(left.translateXPercent).toBeLessThan(PEEK_SLIDE_PERCENT);
    expect(right.translateXPercent).toBe(-left.translateXPercent);
    expect(left.opacity).toBeGreaterThan(0);
    expect(left.opacity).toBeLessThan(1);
    expect(right.opacity).toBe(left.opacity);
  });

  it('has slid the full distance and faded away at progress 1', () => {
    expect(peekStyle(1, 'left', false)).toEqual({
      translateXPercent: PEEK_SLIDE_PERCENT,
      opacity: 0,
      feather: PEEK_FEATHER_FRACTION,
      featherEdge: 'left',
      parentOpacity: 1,
      backdrop: 1,
    });
    expect(peekStyle(1, 'right', false).translateXPercent).toBe(-PEEK_SLIDE_PERCENT);
  });

  it('is gone by 0.9 and never rises as progress grows', () => {
    expect(peekStyle(0.9, 'left', false).opacity).toBe(0);
    let last = 1;
    for (let p = 0; p <= 1; p += 0.05) {
      const o = peekStyle(p, 'left', false).opacity;
      expect(o).toBeLessThanOrEqual(last);
      last = o;
    }
  });

  it('feathers the edge the screen leaves behind, for both edges', () => {
    const left = peekStyle(0.5, 'left', false);
    const right = peekStyle(0.5, 'right', false);
    expect(left.feather).toBe(PEEK_FEATHER_FRACTION);
    expect(left.featherEdge).toBe('left');
    expect(right.feather).toBe(PEEK_FEATHER_FRACTION);
    expect(right.featherEdge).toBe('right');
  });

  it('grows the feather from nothing at the start', () => {
    const early = peekStyle(0.02, 'left', false).feather;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(PEEK_FEATHER_FRACTION);
    expect(peekStyle(0, 'left', false).feather).toBe(0);
  });

  it('shows nothing of the screen Back goes to at the start, and all of it by the end', () => {
    const start = peekStyle(0, 'left', false);
    expect(start.opacity).toBe(1);
    expect(start.parentOpacity).toBe(0);
    const end = peekStyle(1, 'left', false);
    expect(end.opacity).toBe(0);
    expect(end.parentOpacity).toBe(1);
  });

  it('holds the screen Back goes to out entirely below the hidden threshold', () => {
    for (let p = 0; p < PEEK_PARENT_HIDDEN_BELOW; p += 0.01) {
      expect(peekStyle(p, 'left', false).parentOpacity).toBe(0);
    }
    expect(peekStyle(0.4, 'left', false).parentOpacity).toBeGreaterThan(0);
  });

  it('keeps the darkness constant when the screen and the one Back goes to share a scrim', () => {
    // The one backdrop dissolves from the leaving screen's scrim to the destination's, whatever they are.
    const scrim = 0.74;
    for (let p = 0; p <= 1; p += 0.02) {
      const w = peekStyle(p, 'left', false).backdrop;
      const darkness = (1 - w) * scrim + w * scrim;
      expect(darkness).toBeCloseTo(scrim, 10);
    }
  });

  it('fades the backdrop to nothing when Back goes to the game, with no dip on the way', () => {
    const scrim = 0.74;
    let last = scrim;
    for (let p = 0; p <= 1; p += 0.02) {
      const darkness = (1 - peekStyle(p, 'left', false).backdrop) * scrim;
      expect(darkness).toBeLessThanOrEqual(last + 1e-9);
      last = darkness;
    }
    expect(peekStyle(0, 'left', false).backdrop).toBe(0);
    expect(last).toBe(0);
  });

  it('runs the backdrop in step with the screen fading, from the start', () => {
    expect(peekStyle(0, 'left', false).backdrop).toBe(0);
    expect(peekStyle(0.05, 'left', false).backdrop).toBeGreaterThan(0);
    expect(peekStyle(PEEK_PARENT_HIDDEN_BELOW + 0.75, 'left', false).backdrop).toBe(1);
    for (let p = 0; p <= 1; p += 0.05) {
      const s = peekStyle(p, 'right', false);
      expect(s.backdrop).toBeCloseTo(1 - s.opacity, 10);
    }
  });

  it('never has the parent more than whole, or going backwards as the gesture goes on', () => {
    let last = 0;
    for (let p = 0; p <= 1; p += 0.02) {
      const b = peekStyle(p, 'left', false).parentOpacity;
      expect(b).toBeGreaterThanOrEqual(last - 1e-9);
      expect(b).toBeLessThanOrEqual(1);
      last = b;
    }
  });

  it('crossfades the same way under reduced motion, without moving', () => {
    for (const p of [0, 0.1, 0.3, 0.6, 1]) {
      const full = peekStyle(p, 'left', false);
      const reduced = peekStyle(p, 'left', true);
      expect(reduced.parentOpacity).toBe(full.parentOpacity);
      expect(reduced.backdrop).toBe(full.backdrop);
      expect(reduced.translateXPercent).toBe(0);
    }
  });

  it('only fades under reduced motion', () => {
    const full = peekStyle(0.5, 'left', false);
    const reduced = peekStyle(0.5, 'left', true);
    expect(reduced.translateXPercent).toBe(0);
    expect(reduced.feather).toBe(0);
    expect(reduced.opacity).toBe(full.opacity);
  });

  it('clamps progress that is out of range or not a number', () => {
    expect(peekStyle(-1, 'left', false)).toEqual(peekStyle(0, 'left', false));
    expect(peekStyle(2, 'left', false)).toEqual(peekStyle(1, 'left', false));
    expect(peekStyle(Number.NaN, 'left', false)).toEqual(peekStyle(0, 'left', false));
  });
});

/** A host and a clock a test can step by hand. */
function rig(canPeek = true) {
  const log: string[] = [];
  const styles: { style: PeekStyle; settle: boolean }[] = [];
  const host: PeekHost = {
    begin: () => {
      log.push('begin');
      return canPeek;
    },
    apply: (style, settle) => {
      log.push('apply');
      styles.push({ style, settle });
    },
    end: () => log.push('end'),
  };
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const frames = new Map<number, () => void>();
  const clock: PeekClock = {
    setTimeout: (fn, ms) => {
      timers.set(next, { at: now + ms, fn });
      return next++;
    },
    clearTimeout: (id) => void timers.delete(id),
    frame: (fn) => {
      frames.set(next, fn);
      return next++;
    },
    cancelFrame: (id) => void frames.delete(id),
  };
  const peek = new BackPeek(host, clock, () => false);
  return {
    peek,
    log,
    styles,
    frame: () => {
      const run = [...frames.values()];
      frames.clear();
      run.forEach((f) => f());
    },
    advance: (ms: number) => {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

describe('BackPeek', () => {
  it('does nothing where the host has no peek', () => {
    const r = rig(false);
    r.peek.started();
    r.peek.progress(0.5);
    r.frame();
    r.peek.cancelled();
    expect(r.peek.active).toBe(false);
    expect(r.log).toEqual(['begin']);
  });

  it('starts at rest, follows progress once a frame, and ignores progress before a start', () => {
    const r = rig();
    r.peek.progress(0.4);
    r.frame();
    expect(r.log).toEqual([]);
    r.peek.started('right');
    expect(r.styles[0]?.style).toMatchObject({ translateXPercent: 0, opacity: 1, feather: 0 });
    expect(r.styles[0]?.settle).toBe(false);
    r.peek.progress(0.2);
    r.peek.progress(0.6);
    expect(r.styles).toHaveLength(1);
    r.frame();
    expect(r.styles).toHaveLength(2);
    expect(r.styles[1]?.style.translateXPercent).toBeLessThan(0);
    expect(r.styles[1]?.settle).toBe(false);
  });

  it('glides back and ends after a cancel', () => {
    const r = rig();
    r.peek.started();
    r.peek.progress(0.7);
    r.peek.cancelled();
    r.frame();
    const last = r.styles[r.styles.length - 1];
    expect(last?.style).toMatchObject({ translateXPercent: 0, opacity: 1, feather: 0 });
    expect(last?.settle).toBe(true);
    expect(r.peek.active).toBe(true);
    r.advance(PEEK_SETTLE_MS);
    expect(r.peek.active).toBe(false);
    expect(r.log[r.log.length - 1]).toBe('end');
  });

  it('ends at once when asked, and only once', () => {
    const r = rig();
    r.peek.started();
    r.peek.end();
    r.peek.end();
    expect(r.log.filter((l) => l === 'end')).toHaveLength(1);
    r.advance(PEEK_TIMEOUT_MS * 2);
    expect(r.log.filter((l) => l === 'end')).toHaveLength(1);
  });

  it('lets go when no event arrives, and stays alive while events do', () => {
    const r = rig();
    r.peek.started();
    r.advance(PEEK_TIMEOUT_MS - 1);
    r.peek.progress(0.3);
    r.advance(PEEK_TIMEOUT_MS - 1);
    expect(r.peek.active).toBe(true);
    r.advance(1);
    expect(r.peek.active).toBe(false);
    expect(r.log[r.log.length - 1]).toBe('end');
  });

  it('can start again while a cancel is still gliding back', () => {
    const r = rig();
    r.peek.started();
    r.peek.cancelled();
    r.peek.started();
    expect(r.log).toEqual(['begin', 'apply', 'apply', 'end', 'begin', 'apply']);
    expect(r.peek.active).toBe(true);
  });
});
