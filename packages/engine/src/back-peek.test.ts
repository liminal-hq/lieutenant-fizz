// Tests for the Back peek's look and its state.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  BackPeek,
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
      expect(peekStyle(0, edge, false)).toEqual({ translateXPercent: 0, opacity: 1 });
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

  it('only fades under reduced motion', () => {
    const full = peekStyle(0.5, 'left', false);
    const reduced = peekStyle(0.5, 'left', true);
    expect(reduced.translateXPercent).toBe(0);
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
    expect(r.styles[0]).toEqual({ style: { translateXPercent: 0, opacity: 1 }, settle: false });
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
    expect(last).toEqual({ style: { translateXPercent: 0, opacity: 1 }, settle: true });
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
