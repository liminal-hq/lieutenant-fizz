// Tests for the replay overlay: the world and canvas mapping, and what each drawer puts on a fake canvas.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH_SPEC, placeControls } from '../touch-layout';
import {
  COLOURS,
  drawControls,
  drawCross,
  drawDot,
  drawFinger,
  drawPolyline,
  drawRing,
  drawTrace,
  shiftedColour,
  toScreen,
  toWorld,
  type Ctx2D,
  type Finger,
  type WorldView,
} from './overlay';

/** A context that records its calls, with the style at each stroke or fill. */
function fakeCtx() {
  const calls: string[] = [];
  const strokes: { colour: string; alpha: number }[] = [];
  const fills: { colour: string; alpha: number }[] = [];
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    beginPath: () => calls.push('begin'),
    arc: () => calls.push('arc'),
    moveTo: () => calls.push('move'),
    lineTo: () => calls.push('line'),
    rect: () => calls.push('rect'),
    stroke: () => {
      calls.push('stroke');
      strokes.push({ colour: String(ctx.strokeStyle), alpha: ctx.globalAlpha });
    },
    fill: () => {
      calls.push('fill');
      fills.push({ colour: String(ctx.fillStyle), alpha: ctx.globalAlpha });
    },
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setLineDash: () => calls.push('dash'),
  };
  return { ctx: ctx as unknown as Ctx2D, calls, strokes, fills };
}

const view: WorldView = { camX: 10, camY: 5, ppu: 32, width: 800, height: 400 };

describe('the world and the canvas', () => {
  it('puts the camera in the middle, y up the world and down the canvas', () => {
    expect(toScreen(view, 10, 5)).toEqual({ x: 400, y: 200 });
    expect(toScreen(view, 11, 6)).toEqual({ x: 432, y: 168 });
  });

  it('is undone by toWorld', () => {
    const p = toScreen(view, 13.25, 2.5);
    const w = toWorld(view, p.x, p.y);
    expect(w.x).toBeCloseTo(13.25, 9);
    expect(w.y).toBeCloseTo(2.5, 9);
  });
});

describe('drawControls', () => {
  const placed = placeControls(
    844,
    390,
    { top: 0, right: 0, bottom: 0, left: 0 },
    DEFAULT_TOUCH_SPEC,
  );

  it('draws a dashed hit area and a faint face for each control, and restores the context', () => {
    const { ctx, calls, strokes } = fakeCtx();
    drawControls(ctx, placed);
    expect(strokes).toHaveLength(5);
    expect(calls.filter((c) => c === 'fill')).toHaveLength(5);
    expect(calls[0]).toBe('save');
    expect(calls[calls.length - 1]).toBe('restore');
  });

  it('draws only the controls asked for', () => {
    const { ctx, strokes } = fakeCtx();
    drawControls(ctx, placed, ['dpad', 'jump']);
    expect(strokes).toHaveLength(2);
  });
});

describe('drawFinger', () => {
  const finger = (over: Partial<Finger> = {}): Finger => ({
    x: 100,
    y: 100,
    miss: false,
    down: true,
    fade: 1,
    trail: [],
    ...over,
  });

  it('draws a landed touch as a filled cyan disc', () => {
    const { ctx, fills, strokes } = fakeCtx();
    drawFinger(ctx, finger());
    expect(fills).toEqual([{ colour: COLOURS.hit, alpha: 0.85 }]);
    expect(strokes).toEqual([]);
  });

  it('draws a miss as a magenta ring and a cross, so it differs by shape as well as colour', () => {
    const { ctx, fills, strokes, calls } = fakeCtx();
    drawFinger(ctx, finger({ miss: true }));
    expect(fills).toEqual([]);
    expect(strokes.map((s) => s.colour)).toEqual([COLOURS.miss, COLOURS.miss]);
    expect(calls.filter((c) => c === 'arc')).toHaveLength(1);
    expect(calls.filter((c) => c === 'line')).toHaveLength(2);
  });

  it('draws the trail first, and fades with the finger', () => {
    const { ctx, strokes } = fakeCtx();
    drawFinger(
      ctx,
      finger({
        fade: 0.5,
        down: false,
        trail: [
          { x: 90, y: 90 },
          { x: 100, y: 100 },
        ],
      }),
    );
    expect(strokes).toEqual([{ colour: COLOURS.hit, alpha: 0.25 }]);
  });
});

describe('drawDot and shiftedColour', () => {
  it('fills a circle in the colour given', () => {
    const a = fakeCtx();
    drawDot(a.ctx, 4, 5, 3, '#fff');
    expect(a.calls).toEqual(['save', 'begin', 'arc', 'fill', 'restore']);
    expect(a.fills).toEqual([{ colour: '#fff', alpha: 1 }]);
  });

  it('moves the hue a little each time and comes round after twelve', () => {
    expect(shiftedColour(0)).toBe('hsl(190, 90%, 62%)');
    expect(shiftedColour(1)).toBe('hsl(220, 90%, 62%)');
    expect(shiftedColour(12)).toBe(shiftedColour(0));
    expect(new Set(Array.from({ length: 12 }, (_, n) => shiftedColour(n))).size).toBe(12);
  });
});

describe('drawTrace', () => {
  const pts = (flags: boolean[]) => flags.map((flag, i) => ({ x: i, y: 0, flag }));

  it('draws one stroke in the plain colour when nothing is flagged', () => {
    const a = fakeCtx();
    drawTrace(a.ctx, pts([false, false, false]), COLOURS.path, COLOURS.pogo);
    expect(a.strokes.map((s) => s.colour)).toEqual([COLOURS.path]);
  });

  it('colours the segments that end on a flagged point, and joins the runs without a gap', () => {
    const a = fakeCtx();
    drawTrace(a.ctx, pts([false, false, true, true, false, false]), COLOURS.path, COLOURS.pogo);
    expect(a.strokes.map((s) => s.colour)).toEqual([COLOURS.path, COLOURS.pogo, COLOURS.path]);
    // Each run starts where the last one ended: runs of 1, 2 and 2 segments make 5 lines.
    expect(a.calls.filter((c) => c === 'move')).toHaveLength(3);
    expect(a.calls.filter((c) => c === 'line')).toHaveLength(2 + 2 + 1);
  });

  it('draws nothing for fewer than two points', () => {
    const a = fakeCtx();
    drawTrace(a.ctx, pts([true]), COLOURS.path, COLOURS.pogo);
    expect(a.calls).toEqual([]);
  });
});

describe('the line, cross and ring drawers', () => {
  it('draws a line through its points, and nothing for fewer than two', () => {
    const a = fakeCtx();
    drawPolyline(a.ctx, [{ x: 0, y: 0 }], COLOURS.path);
    expect(a.calls).toEqual([]);
    const b = fakeCtx();
    drawPolyline(
      b.ctx,
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 9, y: 2 },
      ],
      COLOURS.path,
      3,
      0.5,
    );
    expect(b.calls.filter((c) => c === 'move')).toHaveLength(1);
    expect(b.calls.filter((c) => c === 'line')).toHaveLength(2);
    expect(b.strokes).toEqual([{ colour: COLOURS.path, alpha: 0.5 }]);
  });

  it('draws a cross and a ring in the colour given', () => {
    const a = fakeCtx();
    drawCross(a.ctx, 10, 10, 6, COLOURS.death);
    expect(a.strokes).toEqual([{ colour: COLOURS.death, alpha: 1 }]);
    const b = fakeCtx();
    drawRing(b.ctx, 10, 10, 20, COLOURS.dwell);
    expect(b.strokes).toEqual([{ colour: COLOURS.dwell, alpha: 1 }]);
    expect(b.calls).toContain('arc');
  });
});
