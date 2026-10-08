// Where the on-screen touch controls sit: pure geometry from the window size and the safe-area insets.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Offsets are CSS pixels from the safe area's corners, taken from the 2a artboard (a 360 px tall
// phone). Nothing here touches the DOM, so the placement is unit-tested at several phone sizes.

import type { Circle, ControlId, Rect, Shape, TouchLayout } from './touch';

/** Space the system keeps for itself (a display cutout, the bars), in CSS pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A round button: its visual diameter and how far its edge is from the safe corner. */
export interface ButtonSpec {
  d: number;
  right: number;
  bottom: number;
}

/** A control that can be moved: every control but Pause, which stays in the corner. */
export type MovableId = Exclude<ControlId, 'pause'>;

/**
 * Where a moved control sits, in spec pixels (before the Size scale) from the control's own safe
 * corner: `side` is the gap from its face edge to the screen edge it is anchored to (the left edge for
 * the D-pad, the right edge for the buttons, mirrored when left-handed) and `bottom` the gap from the
 * bottom of the safe area. These are the same numbers `TouchSpec` holds for the default positions.
 */
export interface EdgeOffset {
  side: number;
  bottom: number;
}

export interface TouchSpec {
  /** The smallest hit area, in CSS pixels (Android's 48 dp). */
  minHit: number;
  /** How much larger than its face the D-pad's hit area is, so a thumb near its edge still counts. */
  dpadSlop: number;
  dpad: { d: number; left: number; bottom: number };
  jump: ButtonSpec;
  pogo: ButtonSpec;
  fire: ButtonSpec;
  /** Pause keeps its size on every screen: a small face inside a hit area of `hit` pixels. */
  pause: { d: number; hit: number; right: number; top: number };
  /** A multiplier on every size and offset (the Size setting changes this). */
  scale: number;
  /** Swaps the D-pad and the buttons (Pause stays top right). */
  leftHanded: boolean;
  /** Controls the player moved, by their offset from the safe corner; absent means the default place. */
  moved?: Partial<Record<MovableId, EdgeOffset>>;
  /** Room kept free when controls are moved, in CSS pixels. */
  reserve: Reserve;
}

/** The space a moved control must leave alone. */
export interface Reserve {
  /** From the top of the safe area down: clears the HUD pills, the boss and toast lines and Pause. */
  top: number;
  /** The narrowest menu column, kept free between the two sides. */
  content: number;
  /** The least space between two faces. */
  gap: number;
  /** The least space between a hit area and the edge of the safe area. */
  edge: number;
}

export const DEFAULT_TOUCH_SPEC: TouchSpec = {
  minHit: 48,
  dpadSlop: 8,
  dpad: { d: 150, left: 24, bottom: 22 },
  // Jump is the largest and sits where the thumb rests; Fizz is to its left and Pogo above it.
  jump: { d: 80, right: 24, bottom: 26 },
  fire: { d: 62, right: 118, bottom: 30 },
  pogo: { d: 62, right: 36, bottom: 118 },
  pause: { d: 36, hit: 48, right: 8, top: 8 },
  scale: 1,
  leftHanded: false,
  reserve: { top: 96, content: 300, gap: 8, edge: 8 },
};

export interface PlacedControls {
  /** The hit areas, for `TouchState`. */
  hit: TouchLayout;
  /** The drawn faces, for the DOM (a face can be smaller than its hit area, never the reverse). */
  face: Record<ControlId, Circle>;
  /** Whether the player's moved controls are in use; false when none moved or the layout fell back to the defaults. */
  custom: boolean;
}

/** The window minus the insets: where controls and the HUD may sit. */
export function safeRect(width: number, height: number, insets: Insets): Rect {
  return {
    x: insets.left,
    y: insets.top,
    w: width - insets.left - insets.right,
    h: height - insets.top - insets.bottom,
  };
}

/** Whether a shape lies entirely inside a rectangle. */
export function inside(r: Rect, s: Shape): boolean {
  if ('r' in s) {
    return (
      s.cx - s.r >= r.x && s.cx + s.r <= r.x + r.w && s.cy - s.r >= r.y && s.cy + s.r <= r.y + r.h
    );
  }
  return s.x >= r.x && s.x + s.w <= r.x + r.w && s.y >= r.y && s.y + s.h <= r.y + r.h;
}

/** Rounds up to a whole pixel, ignoring floating-point noise a few billionths over a whole number. */
const up = (v: number): number => Math.ceil(v - 1e-9);

/** How far menu content keeps from each side so it never sits under a control, in CSS pixels. */
export interface Gutters {
  left: number;
  right: number;
}

/**
 * The room menu content leaves on each side of a `width` px window for the controls in `shown`: the
 * outer edge of the furthest face on that side plus `margin`, or 0 when no shown control is on that
 * side. A control counts on the side its centre is on, so a left-handed layout works the same way.
 */
export function sideGutters(
  placed: PlacedControls,
  width: number,
  shown: readonly ControlId[],
  margin = 16,
): Gutters {
  let left = 0;
  let right = 0;
  for (const id of shown) {
    const f = placed.face[id];
    if (f.cx < width / 2) left = Math.max(left, up(f.cx + f.r + margin));
    else right = Math.max(right, up(width - (f.cx - f.r) + margin));
  }
  return { left, right };
}

/** Which side of the screen a control is on: by its centre, so a left-handed layout works the same way. */
export function controlSide(
  placed: PlacedControls,
  width: number,
  id: ControlId,
): 'left' | 'right' {
  return placed.face[id].cx < width / 2 ? 'left' : 'right';
}

/** How far down from the top of the window the highest low control on each side starts (0 for none). */
export interface SideTops {
  left: number;
  right: number;
}

/**
 * Where content that sits above the controls must stop, for a `width` × `height` window: on each
 * side, the top edge of the highest shown face in the lower half of the window, minus `margin`, or 0
 * when that side has none. The corner controls (Pause) do not count: they are handled by the gutters,
 * and the content they would limit sits well below them.
 */
export function sideTops(
  placed: PlacedControls,
  width: number,
  height: number,
  shown: readonly ControlId[],
  margin = 16,
): SideTops {
  const tops: SideTops = { left: 0, right: 0 };
  for (const id of shown) {
    const f = placed.face[id];
    if (f.cy < height / 2) continue;
    const side = controlSide(placed, width, id);
    const top = Math.floor(f.cy - f.r - margin);
    if (tops[side] === 0 || top < tops[side]) tops[side] = top;
  }
  return tops;
}

/** The scale that keeps the smallest button at least `minHit` on a short screen, and never above 1. */
const fit = (height: number, spec: TouchSpec): number => {
  const smallest = Math.min(spec.jump.d, spec.pogo.d, spec.fire.d);
  const floor = Math.min(1, spec.minHit / smallest);
  return Math.min(1, Math.max(floor, height / 360));
};

const MOVABLE: readonly MovableId[] = ['dpad', 'jump', 'pogo', 'fire'];
/** The gap menu content keeps from a control (the default margin of `sideGutters`). */
const GUTTER_MARGIN = 16;

/** The numbers placement shares: the scale, and the window in mirror space (the hand side on the left). */
interface Frame {
  w: number;
  h: number;
  insets: Insets;
  spec: TouchSpec;
  s: number;
  mirror: boolean;
  /** The inset on the hand side and on the action side. */
  left: number;
  right: number;
}

function frameOf(w: number, h: number, insets: Insets, spec: TouchSpec): Frame {
  const smallest = Math.min(spec.jump.d, spec.pogo.d, spec.fire.d);
  // The Size scale applies after the short-screen fit, so a Small layout on a short screen would
  // shrink the smallest button below minHit; the floor is applied to the product.
  const s = Math.max(spec.minHit / smallest, fit(h, spec) * spec.scale);
  // Right-handed puts the D-pad on the left. Left-handed lays everything out as a mirror image, with
  // the insets swapped, and flips x at the end.
  const mirror = spec.leftHanded;
  return {
    w,
    h,
    insets,
    spec,
    s,
    mirror,
    left: mirror ? insets.right : insets.left,
    right: mirror ? insets.left : insets.right,
  };
}

const flipX = (f: Frame, x: number): number => (f.mirror ? f.w - x : x);
const diameter = (f: Frame, id: MovableId): number => f.spec[id].d;

/** Where a control starts, as the offset the spec holds. */
const defaultOffset = (spec: TouchSpec, id: MovableId): EdgeOffset =>
  id === 'dpad'
    ? { side: spec.dpad.left, bottom: spec.dpad.bottom }
    : { side: spec[id].right, bottom: spec[id].bottom };

/** A control's face in mirror space, at an offset from its own safe corner. */
function faceAt(f: Frame, id: MovableId, off: EdgeOffset): Circle {
  const d = diameter(f, id);
  const r = (d / 2) * f.s;
  const cy = f.h - f.insets.bottom - (off.bottom + d / 2) * f.s;
  const cx =
    id === 'dpad' ? f.left + (off.side + d / 2) * f.s : f.w - f.right - (off.side + d / 2) * f.s;
  return { cx, cy, r };
}

/** The radius of a control's hit area, given its face radius. */
const hitRadius = (f: Frame, id: MovableId, r: number): number =>
  id === 'dpad' ? r + f.spec.dpadSlop : Math.max(r, f.spec.minHit / 2);

/**
 * How much room each side of a menu may take, in whole pixels: the gutter of the D-pad on the hand side
 * and of the buttons on the other. A menu keeps `reserve.content` between them, so together they take
 * at most `w - content`, split evenly, except that a side's default place is always allowed and the
 * other side then gives up what it needs (the sum never exceeds `max(w - content, the default sum)`).
 */
function gutterLimits(f: Frame): { hand: number; action: number } {
  const dp = faceAt(f, 'dpad', defaultOffset(f.spec, 'dpad'));
  const jp = faceAt(f, 'jump', defaultOffset(f.spec, 'jump'));
  const defHand = up(dp.cx + dp.r + GUTTER_MARGIN);
  const defAction = up(f.w - (jp.cx - jp.r) + GUTTER_MARGIN);
  const budget = f.w - f.spec.reserve.content;
  const half = Math.ceil(budget / 2);
  return {
    hand: Math.max(defHand, budget - Math.max(defAction, half)),
    action: Math.max(defAction, budget - Math.max(defHand, half)),
  };
}

/** The box a control's face centre may be in, in mirror space. */
function zoneMirror(f: Frame, id: MovableId): Rect {
  const def = faceAt(f, id, defaultOffset(f.spec, id));
  const rh = hitRadius(f, id, def.r);
  const { top, edge } = f.spec.reserve;
  const yLo = f.insets.top + top + def.r;
  const yHi = f.h - f.insets.bottom - edge - rh;
  const limit = gutterLimits(f);
  let xLo: number;
  let xHi: number;
  if (id === 'dpad') {
    xLo = f.left + edge + rh;
    xHi = limit.hand - GUTTER_MARGIN - def.r;
  } else {
    xLo = f.w + GUTTER_MARGIN - limit.action + def.r;
    xHi = f.w - f.right - edge - rh;
  }
  // A window too small to hold the zone keeps the default place.
  if (xLo > xHi || yLo > yHi) return { x: def.cx, y: def.cy, w: 0, h: 0 };
  // The default place is always allowed, so a layout that was never moved is never pushed.
  xLo = Math.min(xLo, def.cx);
  xHi = Math.max(xHi, def.cx);
  const y0 = Math.min(yLo, def.cy);
  const y1 = Math.max(yHi, def.cy);
  return { x: xLo, y: y0, w: xHi - xLo, h: y1 - y0 };
}

/**
 * The box the centre of a movable control's face may be in, in window coordinates: on its own side of
 * the screen, below the top band, inside the safe area, and leaving menus a column of
 * `spec.reserve.content` px. The default place is always inside it.
 */
export function controlZone(
  id: MovableId,
  width: number,
  height: number,
  insets: Insets,
  spec: TouchSpec = DEFAULT_TOUCH_SPEC,
): Rect {
  const f = frameOf(width, height, insets, spec);
  const z = zoneMirror(f, id);
  return f.mirror ? { ...z, x: width - z.x - z.w } : z;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const EPS = 1e-6;

/** The distance between two hit areas' edges: negative when they overlap. */
function hitClearance(a: Shape, b: Shape): number {
  if ('r' in a && 'r' in b) return Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.r - b.r;
  const [c, r] = 'r' in a ? [a, b as Rect] : [b as Circle, a as Rect];
  const nx = clamp(c.cx, r.x, r.x + r.w);
  const ny = clamp(c.cy, r.y, r.y + r.h);
  return Math.hypot(c.cx - nx, c.cy - ny) - c.r;
}

/**
 * Whether a placement is usable: every hit area inside the safe rectangle, no two hit areas
 * overlapping, and every two faces at least `gap` apart.
 */
export function validPlacement(placed: PlacedControls, safe: Rect, gap: number): boolean {
  const ids: ControlId[] = ['dpad', 'jump', 'pogo', 'fire', 'pause'];
  for (const id of ids) if (!inside(safe, placed.hit[id])) return false;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (hitClearance(placed.hit[a], placed.hit[b]) < -EPS) return false;
      const fa = placed.face[a];
      const fb = placed.face[b];
      if (hitClearance(fa, fb) < gap - EPS) return false;
    }
  }
  return true;
}

/** Builds the placement for a frame, with these controls moved (clamped into their zones). */
function build(f: Frame, moved: TouchSpec['moved']): PlacedControls {
  const { spec } = f;
  const circle = {} as Record<MovableId, Circle>;
  for (const id of MOVABLE) {
    const off = moved?.[id];
    let c = faceAt(f, id, off ?? defaultOffset(spec, id));
    if (off) {
      const z = zoneMirror(f, id);
      c = { ...c, cx: clamp(c.cx, z.x, z.x + z.w), cy: clamp(c.cy, z.y, z.y + z.h) };
    }
    circle[id] = { ...c, cx: flipX(f, c.cx) };
  }
  const { dpad, jump, pogo, fire } = circle;

  const pauseRect: Rect = {
    x: f.w - f.insets.right - spec.pause.right - spec.pause.hit,
    y: f.insets.top + spec.pause.top,
    w: spec.pause.hit,
    h: spec.pause.hit,
  };
  const pauseFace: Circle = {
    cx: pauseRect.x + pauseRect.w / 2,
    cy: pauseRect.y + pauseRect.h / 2,
    r: spec.pause.d / 2,
  };

  const grow = (c: Circle): Circle => ({ ...c, r: Math.max(c.r, spec.minHit / 2) });
  return {
    hit: {
      dpad: { ...dpad, r: dpad.r + spec.dpadSlop },
      jump: grow(jump),
      pogo: grow(pogo),
      fire: grow(fire),
      pause: pauseRect,
    },
    face: { dpad, jump, pogo, fire, pause: pauseFace },
    custom: false,
  };
}

/**
 * Places every control for a window of `width` × `height` CSS pixels with these safe-area insets.
 * Moved controls are clamped into their zones; if the result is not a valid placement (two controls
 * on top of each other, say) the whole layout falls back to the default places.
 */
export function placeControls(
  width: number,
  height: number,
  insets: Insets,
  spec: TouchSpec = DEFAULT_TOUCH_SPEC,
): PlacedControls {
  const f = frameOf(width, height, insets, spec);
  const moved = spec.moved;
  if (moved && MOVABLE.some((id) => moved[id])) {
    const custom = build(f, moved);
    if (validPlacement(custom, safeRect(width, height, insets), spec.reserve.gap)) {
      return { ...custom, custom: true };
    }
  }
  return build(f, undefined);
}
