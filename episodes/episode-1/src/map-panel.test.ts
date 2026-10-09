// Tests for where the map panel docks on a phone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  DEFAULT_TOUCH_SPEC,
  placeControls,
  safeRect,
  type Insets,
} from '@lieutenant-fizz/engine/touch-layout';
import { describe, expect, it } from 'vitest';
import {
  BEN_GAP,
  EDGE,
  benBox,
  dockBest,
  dockPanel,
  maxPanelWidth,
  overlaps,
  pickSide,
  shapeBox,
  type Box,
  type DockInput,
  type Obstacle,
  viewPoint,
} from './map-panel';

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const SIZES: [number, number][] = [
  [844, 390],
  [740, 360],
  [640, 320],
];

/** A stand-in for the card: 11 px a letter, 26 px a line, 20 px of padding, a title line and an action line. */
const measureFor =
  (chars: number) =>
  (w: number): number =>
    26 * (1 + Math.ceil((chars * 11) / Math.max(1, w - 20)) + 2) + 12;

function scene(
  w: number,
  h: number,
  opts: {
    left?: boolean;
    scale?: number;
    moved?: Record<string, { side: number; bottom: number }>;
    insets?: Insets;
    benX?: number;
    chars?: number;
  } = {},
) {
  const insets = opts.insets ?? NONE;
  const placed = placeControls(w, h, insets, {
    ...DEFAULT_TOUCH_SPEC,
    leftHanded: opts.left ?? false,
    scale: opts.scale ?? 1,
    ...(opts.moved ? { moved: opts.moved } : {}),
  });
  const obstacles: Obstacle[] = (['dpad', 'jump', 'pogo', 'fire', 'pause'] as const).map((id) => ({
    hit: shapeBox(placed.hit[id]),
    face: shapeBox(placed.face[id]),
  }));
  // The pills at the top left.
  const pills = { x: insets.left + 8, y: insets.top + 8, w: 190, h: 32 };
  obstacles.push({ hit: pills, face: pills });
  const benX = opts.benX ?? w / 2;
  const input: Omit<DockInput, 'side'> = {
    safe: safeRect(w, h, insets),
    ben: benBox(benX, h / 2 + 10, h / 12),
    obstacles,
    maxWidth: maxPanelWidth(w),
    measure: measureFor(opts.chars ?? 70),
  };
  return { input, obstacles, benX };
}

describe('pickSide', () => {
  it('docks away from Ben', () => {
    expect(pickSide(100, 800, null)).toBe('right');
    expect(pickSide(700, 800, null)).toBe('left');
  });

  it('stays put in the band around the middle, whichever side it was on', () => {
    expect(pickSide(400, 800, 'left')).toBe('left');
    expect(pickSide(400, 800, 'right')).toBe('right');
    expect(pickSide(430, 800, 'right')).toBe('right');
    expect(pickSide(370, 800, 'left')).toBe('left');
  });

  it('flips only once Ben is clearly past the band', () => {
    expect(pickSide(319, 800, 'left')).toBe('right');
    expect(pickSide(481, 800, 'right')).toBe('left');
  });

  it('does not flap as Ben wobbles about the middle', () => {
    let side = pickSide(300, 800, null);
    expect(side).toBe('right');
    for (const x of [380, 420, 390, 430, 400, 360, 410]) {
      side = pickSide(x, 800, side);
      expect(side).toBe('right');
    }
  });

  it('puts the middle itself on the right when there is no history', () => {
    expect(pickSide(400, 800, null)).toBe('right');
    expect(pickSide(410, 800, null)).toBe('left');
  });
});

describe('maxPanelWidth', () => {
  it('is a share of the screen, never above 360', () => {
    expect(maxPanelWidth(640)).toBe(256);
    expect(maxPanelWidth(844)).toBe(338);
    expect(maxPanelWidth(2000)).toBe(360);
  });
});

describe('dockPanel', () => {
  for (const [w, h] of SIZES) {
    for (const left of [false, true]) {
      it(`keeps Ben, the controls and the pills clear at ${w}x${h}${left ? ' left-handed' : ''}, Ben in the middle`, () => {
        const { input, obstacles } = scene(w, h, { left, chars: 46 });
        const dock = dockBest(input, w / 2, w, null);
        expect(dock.tier).toBeLessThanOrEqual(2);
        expect(overlaps(dock.box, input.ben)).toBe(false);
        // Ben stays at least the gap away.
        const gap =
          dock.side === 'right'
            ? dock.box.x - (input.ben.x + input.ben.w)
            : input.ben.x - (dock.box.x + dock.box.w);
        expect(gap).toBeGreaterThanOrEqual(BEN_GAP - 0.001);
        for (const o of obstacles) expect(overlaps(dock.box, o.face)).toBe(false);
        expect(dock.box.x).toBeGreaterThanOrEqual(EDGE);
        expect(dock.box.x + dock.box.w).toBeLessThanOrEqual(w - EDGE);
        expect(dock.box.y).toBeGreaterThanOrEqual(EDGE);
        expect(dock.box.y + dock.box.h).toBeLessThanOrEqual(h - EDGE);
        expect(dock.box.w).toBeLessThanOrEqual(input.maxWidth);
      });
    }
  }

  it('docks on the side Ben is not on', () => {
    const a = scene(844, 390, { benX: 150 });
    expect(dockBest(a.input, 150, 844, null).side).toBe('right');
    const b = scene(844, 390, { benX: 700 });
    expect(dockBest(b.input, 700, 844, null).side).toBe('left');
  });

  it('sits against the outer edge when there is room to spare', () => {
    const { input } = scene(844, 390, { benX: 150 });
    const dock = dockPanel({ ...input, side: 'right' });
    expect(dock.box.x + dock.box.w).toBeLessThanOrEqual(844 - EDGE);
    expect(dock.box.w).toBe(input.maxWidth);
  });

  it('keeps clear of a notch', () => {
    const insets: Insets = { top: 0, right: 44, bottom: 21, left: 44 };
    const { input, obstacles } = scene(844, 390, { insets });
    const dock = dockBest(input, 422, 844, null);
    expect(dock.box.x).toBeGreaterThanOrEqual(insets.left + EDGE);
    expect(dock.box.x + dock.box.w).toBeLessThanOrEqual(844 - insets.right - EDGE);
    expect(dock.box.y + dock.box.h).toBeLessThanOrEqual(390 - insets.bottom - EDGE);
    for (const o of obstacles) expect(overlaps(dock.box, o.face)).toBe(false);
  });

  it('keeps clear of Large controls', () => {
    for (const [w, h] of SIZES) {
      const { input, obstacles } = scene(w, h, { scale: 1.2, chars: 46 });
      const dock = dockBest(input, w / 2, w, null);
      expect(overlaps(dock.box, input.ben)).toBe(false);
      if (dock.tier <= 2) for (const o of obstacles) expect(overlaps(dock.box, o.face)).toBe(false);
    }
  });

  it('keeps clear of controls the player moved', () => {
    const moved = { dpad: { side: 24, bottom: 200 }, jump: { side: 24, bottom: 120 } };
    const { input, obstacles } = scene(844, 390, { moved, chars: 46 });
    const dock = dockBest(input, 422, 844, null);
    expect(dock.tier).toBeLessThanOrEqual(2);
    expect(overlaps(dock.box, input.ben)).toBe(false);
    for (const o of obstacles) expect(overlaps(dock.box, o.face)).toBe(false);
  });

  it('wraps to a taller panel in a narrower column', () => {
    const { input } = scene(640, 320, { chars: 46 });
    const dock = dockPanel({ ...input, side: 'right' });
    expect(dock.box.h).toBe(input.measure(dock.box.w));
    expect(dock.box.w).toBeLessThan(input.maxWidth);
  });

  it('mirrors for a left-handed layout', () => {
    const r = scene(844, 390, { benX: 150, chars: 46 });
    const l = scene(844, 390, { left: true, benX: 150, chars: 46 });
    const dr = dockBest(r.input, 150, 844, null);
    const dl = dockBest(l.input, 150, 844, null);
    expect(dr.side).toBe('right');
    expect(dl.side).toBe('right');
    for (const o of l.obstacles) expect(overlaps(dl.box, o.face)).toBe(false);
  });

  it('falls back to the least bad place, on screen, when the text is too long', () => {
    const { input } = scene(640, 320, { chars: 97 });
    const dock = dockBest(input, 320, 640, null);
    expect(dock.tier).toBe(3);
    expect(overlaps(dock.box, input.ben)).toBe(false);
    expect(dock.box.y).toBeGreaterThanOrEqual(EDGE);
    expect(dock.box.y + dock.box.h).toBeLessThanOrEqual(320 - EDGE + 1);
  });
});

describe('dockBest', () => {
  it('tries the other side near the middle when the preferred one does not fit', () => {
    const { input } = scene(640, 320, { chars: 60 });
    const left = dockPanel({ ...input, side: 'left' });
    const right = dockPanel({ ...input, side: 'right' });
    const best = dockBest(input, 330, 640, 'left');
    expect(best.tier).toBe(Math.min(left.tier, right.tier));
  });

  it('never leaves Ben’s side when he is clearly off the middle', () => {
    const { input } = scene(640, 320, { benX: 100, chars: 97 });
    expect(dockBest(input, 100, 640, null).side).toBe('right');
  });
});

describe('benBox', () => {
  it('is centred on Ben and a little over a world unit across', () => {
    const b: Box = benBox(100, 50, 20);
    expect(b.x + b.w / 2).toBe(100);
    expect(b.y + b.h / 2).toBe(50);
    expect(b.w).toBeGreaterThan(20);
  });
});

describe('viewPoint', () => {
  it('puts the camera at the middle of the canvas and counts y upward', () => {
    expect(viewPoint(10, 5, 10, 5, 30, 800, 400)).toEqual({ x: 400, y: 200 });
    const p = viewPoint(11, 6, 10, 5, 30, 800, 400);
    expect(p).toEqual({ x: 430, y: 170 });
  });

  it('follows the canvas box, which under Fast is larger than the host', () => {
    // A 844x390 host at 2.625 dpr with a whole scale of 5 backs 444x205 pixels: the canvas is 845.7x390.4 CSS.
    const host = { w: 844, h: 390 };
    const canvas = { w: (444 * 5) / 2.625, h: (205 * 5) / 2.625 };
    const ppu = canvas.h / 13;
    const fast = viewPoint(3, 2, 3, 2, ppu, canvas.w, canvas.h);
    const sharp = viewPoint(3, 2, 3, 2, ppu, host.w, host.h);
    expect(fast.x - sharp.x).toBeCloseTo((canvas.w - host.w) / 2, 6);
    expect(fast.y - sharp.y).toBeCloseTo((canvas.h - host.h) / 2, 6);
    expect(fast.x - sharp.x).toBeGreaterThan(0);
  });
});
