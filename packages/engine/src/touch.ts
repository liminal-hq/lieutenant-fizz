// Touch controls as pure logic: hit areas, the sliding D-pad and held buttons with a minimum hold.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Nothing here touches the DOM. A DOM controller turns pointer events into `down`, `move` and `up`
// calls with CSS pixel positions, and `InputManager` turns the held state into sim input bits.

/** The on-screen controls. Pause is a command, not an input bit. */
export type ControlId = 'dpad' | 'jump' | 'pogo' | 'fire' | 'pause';

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A hit area in CSS pixels. */
export type Shape = Circle | Rect;

/** Where each control sits. The D-pad is a circle so a thumb can slide from its centre. */
export interface TouchLayout {
  dpad: Circle;
  jump: Shape;
  pogo: Shape;
  fire: Shape;
  pause: Shape;
}

/** What the touch controls are holding down right now. */
export interface TouchHeld {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  pogo: boolean;
  fire: boolean;
}

export const NO_TOUCH: TouchHeld = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  pogo: false,
  fire: false,
};

/** A tap shorter than one fixed step (1/60 s) must still reach the sim, so a press holds at least this long. */
export const MIN_HOLD_MS = 50;

/** How far from the D-pad centre, as a fraction of its radius, a thumb must move to hold a direction. */
const AXIS = 0.3;

/** When one axis is more than this many times the other, the weaker one is dropped. */
const DOMINANCE = 2;

const isCircle = (s: Shape): s is Circle => 'r' in s;

/** Whether a point is inside a hit area. */
export function contains(s: Shape, x: number, y: number): boolean {
  if (isCircle(s)) return Math.hypot(x - s.cx, y - s.cy) <= s.r;
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

/** The shortest side of a hit area, in CSS pixels. */
export function smallestSide(s: Shape): number {
  return isCircle(s) ? s.r * 2 : Math.min(s.w, s.h);
}

/**
 * The directions held when a thumb is `dx`, `dy` from the D-pad centre (screen y points down). Inside
 * the dead zone nothing is held. Past it, each axis counts on its own, so a diagonal holds two bits,
 * unless one axis is more than twice the other: then only the stronger one counts, so running right
 * with the thumb drifting a little down never aims or looks down. Positions outside the circle count
 * the same as the edge, so a sliding thumb stays captured.
 */
export function dpadDirections(
  dx: number,
  dy: number,
  radius: number,
): Pick<TouchHeld, 'left' | 'right' | 'up' | 'down'> {
  const nx = dx / radius;
  const ny = dy / radius;
  let horizontal = Math.abs(nx) > AXIS;
  let vertical = Math.abs(ny) > AXIS;
  if (horizontal && vertical) {
    if (Math.abs(nx) > DOMINANCE * Math.abs(ny)) vertical = false;
    else if (Math.abs(ny) > DOMINANCE * Math.abs(nx)) horizontal = false;
  }
  return {
    left: horizontal && nx < 0,
    right: horizontal && nx > 0,
    up: vertical && ny < 0,
    down: vertical && ny > 0,
  };
}

/** Hit-test priority where hit areas overlap: the buttons the thumb rests on win over the D-pad. */
const PRIORITY: readonly ControlId[] = ['jump', 'fire', 'pogo', 'dpad', 'pause'];

/** The control a new touch at (x, y) lands on, or null. */
export function hitTest(layout: TouchLayout, x: number, y: number): ControlId | null {
  for (const id of PRIORITY) if (contains(layout[id], x, y)) return id;
  return null;
}

/** The controls whose hit area is smaller than Android's 48 dp minimum (one CSS pixel is one dp). */
export function undersizedTargets(layout: TouchLayout, minDp = 48): ControlId[] {
  return PRIORITY.filter((id) => smallestSide(layout[id]) < minDp);
}

type Button = 'jump' | 'pogo' | 'fire';
const BUTTONS: readonly Button[] = ['jump', 'pogo', 'fire'];

interface Pointer {
  control: Exclude<ControlId, 'pause'>;
  x: number;
  y: number;
}

/**
 * Tracks every finger on the controls by pointer id (so moving and jumping work together) and reports
 * what is held. A button stays held while its finger is down, and also for a minimum time after a
 * press starts, so a quick tap survives until the next fixed step.
 */
export class TouchState {
  private readonly pointers = new Map<number, Pointer>();
  private readonly latchedUntil: Record<Button, number> = { jump: 0, pogo: 0, fire: 0 };

  constructor(
    /** The control geometry. Set by the DOM controller; with none, no touch lands on a control. */
    public layout: TouchLayout | null = null,
    private readonly minHoldMs = MIN_HOLD_MS,
  ) {}

  /** A finger went down. Returns the control it landed on, so the caller can run Pause. */
  down(id: number, x: number, y: number, now: number): ControlId | null {
    this.pointers.delete(id);
    if (!this.layout) return null;
    const control = hitTest(this.layout, x, y);
    if (!control) return null;
    if (control === 'pause') return control;
    this.pointers.set(id, { control, x, y });
    if (control !== 'dpad') this.latchedUntil[control] = now + this.minHoldMs;
    return control;
  }

  /** A finger moved. The D-pad re-evaluates from the new position, so a thumb can roll between arms. */
  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (p) {
      p.x = x;
      p.y = y;
    }
  }

  /** A finger lifted. A button's minimum hold still runs out on its own. */
  up(id: number): void {
    this.pointers.delete(id);
  }

  /** Drops every finger and latch (pointer cancel, the page going to the background). */
  cancelAll(): void {
    this.pointers.clear();
    for (const b of BUTTONS) this.latchedUntil[b] = 0;
  }

  /** Whether any finger is on the controls. */
  get active(): boolean {
    return this.pointers.size > 0;
  }

  /** What is held at time `now` (milliseconds). */
  held(now: number): TouchHeld {
    const h: TouchHeld = { ...NO_TOUCH };
    for (const p of this.pointers.values()) {
      if (p.control === 'dpad') {
        if (!this.layout) continue;
        const d = dpadDirections(
          p.x - this.layout.dpad.cx,
          p.y - this.layout.dpad.cy,
          this.layout.dpad.r,
        );
        h.left ||= d.left;
        h.right ||= d.right;
        h.up ||= d.up;
        h.down ||= d.down;
      } else {
        h[p.control] = true;
      }
    }
    for (const b of BUTTONS) if (now < this.latchedUntil[b]) h[b] = true;
    return h;
  }
}
