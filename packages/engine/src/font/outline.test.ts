// Tests for the pixel-grid to contour tracer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { parse } from './derive';
import { signedArea, traceOutline } from './outline';

describe('traceOutline', () => {
  it('turns one pixel into one clockwise square', () => {
    const c = traceOutline(parse('#'), 1);
    expect(c).toHaveLength(1);
    expect(c[0]).toHaveLength(4);
    expect(signedArea(c[0] ?? [])).toBe(-2);
  });

  it('merges a bar into a single four-point rectangle', () => {
    const c = traceOutline(parse('###'), 1);
    expect(c).toHaveLength(1);
    expect(c[0]).toHaveLength(4);
    expect(signedArea(c[0] ?? [])).toBe(-6);
  });

  it('draws a ring as a clockwise outer contour and a counter-clockwise hole', () => {
    const c = traceOutline(parse('###/#.#/###'), 3);
    expect(c).toHaveLength(2);
    const areas = c.map(signedArea).sort((a, b) => a - b);
    expect(areas).toEqual([-18, 2]);
  });

  it('keeps pixels that touch only at a corner as separate contours', () => {
    const c = traceOutline(parse('#./.#'), 2);
    expect(c).toHaveLength(2);
    expect(c.every((p) => p.length === 4)).toBe(true);
  });

  it('places the top of row 0 at the given height and offsets by left', () => {
    const c = traceOutline(parse('#'), 9, 3);
    const xs = (c[0] ?? []).map((p) => p.x);
    const ys = (c[0] ?? []).map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([3, 4]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([8, 9]);
  });

  it('keeps an L shape as six corner points', () => {
    const c = traceOutline(parse('#./##'), 2);
    expect(c).toHaveLength(1);
    expect(c[0]).toHaveLength(6);
  });

  it('is empty for a blank grid', () => {
    expect(traceOutline(parse('../..'), 2)).toEqual([]);
  });
});
