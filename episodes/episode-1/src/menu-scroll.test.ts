// Tests for the scrolling menu list's maths.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  CHEVRON_SIZE,
  chevronSvg,
  isTap,
  maxScroll,
  menuViewport,
  rowVisible,
  scrollCues,
  scrollToReveal,
  TAP_SLOP,
  visibleWindow,
} from './menu-scroll';

describe('isTap', () => {
  it('is a tap up to the slop and a drag beyond it', () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(TAP_SLOP, 0)).toBe(true);
    expect(isTap(0, -TAP_SLOP)).toBe(true);
    expect(isTap(9, 9)).toBe(false);
    expect(isTap(0, TAP_SLOP + 1)).toBe(false);
  });
});

describe('menuViewport', () => {
  it('is null when the list fits', () => {
    expect(menuViewport(432, 0, 96)).toBeNull();
    expect(menuViewport(432, -20, 96)).toBeNull();
  });

  it('takes the overflow off the list', () => {
    expect(menuViewport(432, 150, 96)).toBe(282);
  });

  it('keeps at least the floor, and never grows past the list', () => {
    expect(menuViewport(432, 400, 96)).toBe(96);
    expect(menuViewport(90, 400, 96)).toBe(90);
  });
});

describe('the visible window', () => {
  it('runs from the scroll offset for the viewport height', () => {
    expect(visibleWindow(48, 240)).toEqual({ top: 48, bottom: 288 });
    expect(maxScroll(240, 432)).toBe(192);
    expect(maxScroll(240, 100)).toBe(0);
  });

  it('knows a row is wholly in view', () => {
    expect(rowVisible(0, 48, 0, 240)).toBe(true);
    expect(rowVisible(192, 48, 0, 240)).toBe(true);
    expect(rowVisible(216, 48, 0, 240)).toBe(false);
    expect(rowVisible(0, 48, 24, 240)).toBe(false);
  });
});

describe('scrollCues', () => {
  it('shows none when everything fits', () => {
    expect(scrollCues(0, 400, 400)).toEqual({ above: false, below: false });
    expect(scrollCues(0, 400, 400.6)).toEqual({ above: false, below: false });
  });

  it('shows "more below" at the top, both in the middle and "more above" at the end', () => {
    expect(scrollCues(0, 240, 432)).toEqual({ above: false, below: true });
    expect(scrollCues(96, 240, 432)).toEqual({ above: true, below: true });
    expect(scrollCues(192, 240, 432)).toEqual({ above: true, below: false });
  });

  it('ignores a pixel of rounding at either end', () => {
    expect(scrollCues(0.5, 240, 432).above).toBe(false);
    expect(scrollCues(191.5, 240, 432).below).toBe(false);
  });
});

describe('scrollToReveal', () => {
  // Nine rows of 48 px (432 px) through a 240 px viewport.
  const at = (row: number, scroll: number, margin = 0): number =>
    scrollToReveal(row * 48, 48, scroll, 240, 432, margin);

  it('stays where it is when the row is in view', () => {
    expect(at(0, 0)).toBe(0);
    expect(at(4, 0)).toBe(0);
    expect(at(3, 96)).toBe(96);
  });

  it('scrolls down just far enough for a row below the window', () => {
    expect(at(5, 0)).toBe(48);
    expect(at(8, 0)).toBe(192);
  });

  it('scrolls up just far enough for a row above the window', () => {
    expect(at(1, 192)).toBe(48);
    expect(at(0, 192)).toBe(0);
  });

  it('leaves the margin for a cue, except where the list ends', () => {
    expect(at(5, 0, 12)).toBe(60);
    expect(at(8, 0, 12)).toBe(192);
    expect(at(1, 192, 12)).toBe(36);
    expect(at(0, 192, 12)).toBe(0);
  });

  it('wraps from the last row to the first and back', () => {
    expect(at(8, at(0, 0))).toBe(192);
    expect(at(0, at(8, 0))).toBe(0);
  });
});

describe('chevronSvg', () => {
  const svg = chevronSvg('#fff', '#050507');

  it('is whole-pixel art the size of CHEVRON_SIZE', () => {
    expect(svg).toContain(`width="${CHEVRON_SIZE.width}"`);
    expect(svg).toContain(`height="${CHEVRON_SIZE.height}"`);
    expect(svg).toContain('crispEdges');
    expect(svg.match(/width="1" height="1"/g)?.length).toBeGreaterThan(30);
  });

  it('draws every pixel inside its box, with ink on top of the outline', () => {
    for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)"/g)) {
      expect(Number(m[1])).toBeLessThan(CHEVRON_SIZE.width);
      expect(Number(m[2])).toBeLessThan(CHEVRON_SIZE.height);
    }
    expect(svg.lastIndexOf('fill="#fff"')).toBeGreaterThan(svg.lastIndexOf('fill="#050507"'));
  });
});
