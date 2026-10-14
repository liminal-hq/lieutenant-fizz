// Draws a replay's layers over the game on a 2D canvas: the touch controls, fingers, paths and marks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ControlId, Shape } from '../touch';
import type { PlacedControls } from '../touch-layout';

/** The parts of a 2D context the drawers use, so a test can pass a small fake. */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'rect'
  | 'stroke'
  | 'fill'
  | 'save'
  | 'restore'
  | 'setLineDash'
> & {
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  lineWidth: number;
  globalAlpha: number;
};

/** The colours of the layers. A touch that landed on a control and one that missed differ in colour and in shape. */
export const COLOURS = {
  control: '#ffffff',
  hit: '#7dd3fc',
  miss: '#e879f9',
  path: '#4ade80',
  pogo: '#facc15',
  ghost: '#9a96b0',
  death: '#f43f5e',
  dwell: '#ffaa40',
} as const;

/** Where the world sits on the canvas: the camera's centre, the pixels in a world unit, and the canvas size. */
export interface WorldView {
  camX: number;
  camY: number;
  /** CSS pixels per world unit. */
  ppu: number;
  width: number;
  height: number;
}

/** A world position (tiles, y up) as a canvas position (CSS pixels, y down). */
export function toScreen(view: WorldView, wx: number, wy: number): { x: number; y: number } {
  return {
    x: (wx - view.camX) * view.ppu + view.width / 2,
    y: view.height / 2 - (wy - view.camY) * view.ppu,
  };
}

/** A canvas position as a world position: the inverse of `toScreen`. */
export function toWorld(view: WorldView, sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - view.width / 2) / view.ppu + view.camX,
    y: (view.height / 2 - sy) / view.ppu + view.camY,
  };
}

function tracePath(ctx: Ctx2D, s: Shape): void {
  ctx.beginPath();
  if ('r' in s) ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
  else ctx.rect(s.x, s.y, s.w, s.h);
}

/**
 * The touch controls as they were placed: each hit area dashed, each face as a faint disc. `shown` limits it
 * to some controls (a menu shows fewer).
 */
export function drawControls(
  ctx: Ctx2D,
  placed: PlacedControls,
  shown: readonly ControlId[] = ['dpad', 'jump', 'pogo', 'fire', 'pause'],
): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const id of shown) {
    ctx.strokeStyle = COLOURS.control;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([5, 4]);
    tracePath(ctx, placed.hit[id]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLOURS.control;
    ctx.globalAlpha = 0.12;
    const face = placed.face[id];
    ctx.beginPath();
    ctx.arc(face.cx, face.cy, face.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** One finger at a moment of the replay. */
export interface Finger {
  x: number;
  y: number;
  /** The touch landed on nothing, or on something that is not a control. */
  miss: boolean;
  /** The finger is still down (a finger that has lifted is fading out). */
  down: boolean;
  /** How visible it is, from 1 (just now) down to 0 (gone). */
  fade: number;
  /** Where it has been recently, oldest first. */
  trail: readonly { x: number; y: number }[];
}

/**
 * A finger: its recent trail, then a disc where it is. A hit is a filled cyan disc; a miss is a magenta ring
 * with a cross, so the two differ by shape as well as colour.
 */
export function drawFinger(ctx: Ctx2D, f: Finger): void {
  ctx.save();
  const colour = f.miss ? COLOURS.miss : COLOURS.hit;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 3;
  if (f.trail.length > 1) {
    ctx.globalAlpha = 0.5 * f.fade;
    ctx.beginPath();
    f.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.globalAlpha = (f.down ? 0.85 : 0.6) * f.fade;
  if (f.miss) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    const k = 6;
    ctx.beginPath();
    ctx.moveTo(f.x - k, f.y - k);
    ctx.lineTo(f.x + k, f.y + k);
    ctx.moveTo(f.x + k, f.y - k);
    ctx.lineTo(f.x - k, f.y + k);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(f.x, f.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A line through canvas points. */
export function drawPolyline(
  ctx: Ctx2D,
  points: readonly { x: number; y: number }[],
  colour: string,
  width = 2,
  alpha = 1,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/**
 * A line through canvas points drawn in two colours: segments that end on a flagged point (the pogo stick
 * was on) take `flagged`, and the rest take `colour`. Each run of one colour is one stroke.
 */
export function drawTrace(
  ctx: Ctx2D,
  points: readonly { x: number; y: number; flag?: boolean }[],
  colour: string,
  flagged: string,
  width = 2,
  alpha = 1,
): void {
  // Segment i joins point i - 1 to point i and takes point i's flag; a run of equal flags is one stroke.
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    const here = points[i]!.flag === true;
    const next = i + 1 < points.length ? points[i + 1]!.flag === true : !here;
    if (here === next) continue;
    drawPolyline(ctx, points.slice(start, i + 1), here ? flagged : colour, width, alpha);
    start = i;
  }
}

/** A cross, for where a life was lost. */
export function drawCross(ctx: Ctx2D, x: number, y: number, size: number, colour: string): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
  ctx.restore();
}

/** A ring, for a place someone stayed. */
export function drawRing(ctx: Ctx2D, x: number, y: number, r: number, colour: string): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
