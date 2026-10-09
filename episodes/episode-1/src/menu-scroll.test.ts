// Tests for the scrolling menu list's maths.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  CHEVRON_SIZE,
  chevronScale,
  chevronSvg,
  isTap,
  maxScroll,
  menuViewport,
  MIN_STRIP,
  rowVisible,
  scrollCues,
  revealRow,
  snapScroll,
  snapViewport,
  stripLayout,
  type RowBox,
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

/** Nine rows of 40 px laid end to end, as a touch menu draws them. */
const nine = (row = 40, gap = 0): RowBox[] =>
  Array.from({ length: 9 }, (_, i) => ({ top: i * (row + gap), height: row }));

describe('snapViewport', () => {
  it('cuts the view to a whole number of rows', () => {
    // 255 px holds six 40 px rows (240); the 15 px over is not a half row.
    expect(snapViewport(nine(), 255)).toBe(240);
    expect(snapViewport(nine(), 239.9)).toBe(200);
    expect(snapViewport(nine(), 240)).toBe(240);
  });

  it('counts the gaps between rows but not one after the last row shown', () => {
    // Rows 24 px with a 2 px gap: four rows are 4 × 24 + 3 × 2 = 102 px.
    expect(snapViewport(nine(24, 2), 110)).toBe(102);
    expect(snapViewport(nine(24, 2), 101)).toBe(76);
  });

  it('never shows fewer than two rows, even when they do not fit', () => {
    expect(snapViewport(nine(), 70)).toBe(80);
    expect(snapViewport(nine(), 0)).toBe(80);
    expect(snapViewport(nine(), 100, 3)).toBe(120);
  });

  it('leaves a view that already holds every row as it is', () => {
    expect(snapViewport(nine(), 400)).toBe(400);
    expect(snapViewport(nine().slice(0, 2), 50)).toBe(50);
  });

  it('measures from the first row and handles an empty list', () => {
    const shifted = nine().map((r) => ({ ...r, top: r.top + 30 }));
    expect(snapViewport(shifted, 255)).toBe(240);
    expect(snapViewport([], 100)).toBe(0);
  });

  it('follows rows of different heights', () => {
    const mixed: RowBox[] = [
      { top: 0, height: 40 },
      { top: 40, height: 64 },
      { top: 104, height: 40 },
      { top: 144, height: 40 },
    ];
    expect(snapViewport(mixed, 150)).toBe(144);
    expect(snapViewport(mixed, 143)).toBe(104);
  });
});

describe('snapScroll', () => {
  // Nine rows (360 px) through a 240 px view scroll at most 120 px.
  it('lands on the nearest row top', () => {
    expect(snapScroll(nine(), 0, 120)).toBe(0);
    expect(snapScroll(nine(), 18, 120)).toBe(0);
    expect(snapScroll(nine(), 22, 120)).toBe(40);
    expect(snapScroll(nine(), 79, 120)).toBe(80);
  });

  it('breaks an exact tie towards the earlier row', () => {
    expect(snapScroll(nine(), 20, 120)).toBe(0);
  });

  it('never goes past where the list scrolls', () => {
    expect(snapScroll(nine(), 500, 120)).toBe(120);
    expect(snapScroll(nine(), 110, 120)).toBe(120);
    expect(snapScroll(nine(), -30, 120)).toBe(0);
  });

  it('stops at the end even when it is not a row top', () => {
    expect(snapScroll(nine(), 100, 105)).toBe(105);
  });

  it('has nowhere to go when the list fits', () => {
    expect(snapScroll(nine(), 33, 0)).toBe(0);
    expect(snapScroll([], 33, 0)).toBe(0);
  });
});

describe('revealRow', () => {
  // Nine rows of 40 px through a 240 px view (six rows) scroll at most 120 px.
  const at = (row: number, scroll: number): number => revealRow(nine(), row, scroll, 240, 360);

  it('stays where it is when the row is in view', () => {
    expect(at(0, 0)).toBe(0);
    expect(at(5, 0)).toBe(0);
    expect(at(3, 80)).toBe(80);
  });

  it('scrolls down by whole rows for a row below the window', () => {
    expect(at(6, 0)).toBe(40);
    expect(at(7, 0)).toBe(80);
    expect(at(8, 0)).toBe(120);
  });

  it('scrolls up to put a row above the window at the top edge', () => {
    expect(at(1, 120)).toBe(40);
    expect(at(0, 120)).toBe(0);
  });

  it('wraps from the last row to the first and back', () => {
    expect(at(8, at(0, 0))).toBe(120);
    expect(at(0, at(8, 0))).toBe(0);
  });

  it('puts a stray offset on a row boundary, keeping the row in view', () => {
    expect(at(2, 17)).toBe(0);
    expect(at(2, 23)).toBe(40);
    expect(at(8, 23)).toBe(120);
  });

  it('always ends on a row top or the end of the list, with the row whole in view', () => {
    for (let row = 0; row < 9; row++) {
      for (let scroll = 0; scroll <= 130; scroll += 7) {
        const next = at(row, scroll);
        expect([0, 40, 80, 120]).toContain(next);
        expect(rowVisible(row * 40, 40, next, 240)).toBe(true);
      }
    }
  });

  it('ignores a row that does not exist', () => {
    expect(at(20, 23)).toBe(40);
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

const rowsOf = (n: number, h: number): RowBox[] =>
  Array.from({ length: n }, (_, i) => ({ top: i * h, height: h }));

describe('stripLayout', () => {
  const rows = rowsOf(9, 40);
  it('spends the pixels snapping frees on the strips, losing no row', () => {
    // 170 px holds four rows (160) with 10 left over: 5 each is under the minimum, so a row goes...
    expect(stripLayout(rows, 170, 20)).toEqual({ view: 120, strip: 20 });
    // ...but 180 holds four rows with 20 left, which is exactly two minimum strips.
    expect(stripLayout(rows, 180, 20)).toEqual({ view: 160, strip: 10 });
    expect(stripLayout(rows, 200, 20)).toEqual({ view: 160, strip: 20 });
  });
  it('gives each strip at most half the spare and at most the wanted height', () => {
    expect(stripLayout(rows, 190, 20)).toEqual({ view: 160, strip: 15 });
    expect(stripLayout(rows, 230, 20)).toEqual({ view: 200, strip: 15 });
    expect(stripLayout(rows, 239, 12)).toEqual({ view: 200, strip: 12 });
  });
  it('keeps the strips within the height given', () => {
    for (let avail = 100; avail < 360; avail++) {
      const l = stripLayout(rows, avail, 20);
      expect(l.view + 2 * l.strip).toBeLessThanOrEqual(avail);
      expect(l.view % 40).toBe(0);
      expect(l.strip).toBeGreaterThanOrEqual(MIN_STRIP);
    }
  });
  it('never shows fewer than two rows, even when the strips then overrun', () => {
    expect(stripLayout(rows, 90, 20)).toEqual({ view: 80, strip: MIN_STRIP });
  });
  it('reserves no strip for a list that fits', () => {
    expect(stripLayout(rowsOf(3, 40), 130, 20)).toEqual({ view: 130, strip: 0 });
  });
  it('works on uniform rows of any height and has nothing for an empty list', () => {
    expect(stripLayout(rowsOf(6, 44), 200, 22)).toEqual({ view: 176, strip: 12 });
    expect(stripLayout([], 200, 20)).toEqual({ view: 0, strip: 0 });
  });
});

describe('chevronScale', () => {
  it('draws the chevron as large as the strip holds with room to step, up to the menu pixel size', () => {
    expect(CHEVRON_SIZE.height).toBe(7);
    expect(chevronScale(10, 3)).toBe(1);
    expect(chevronScale(17, 3)).toBe(1);
    expect(chevronScale(18, 3)).toBe(2);
    expect(chevronScale(26, 3)).toBe(2);
    expect(chevronScale(27, 3)).toBe(3);
    expect(chevronScale(40, 3)).toBe(3);
    expect(chevronScale(40, 2)).toBe(2);
  });
  it('is never under one', () => {
    expect(chevronScale(4, 3)).toBe(1);
    expect(chevronScale(30, 0)).toBe(1);
  });
});
