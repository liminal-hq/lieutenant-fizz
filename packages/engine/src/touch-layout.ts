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
};

export interface PlacedControls {
  /** The hit areas, for `TouchState`. */
  hit: TouchLayout;
  /** The drawn faces, for the DOM (a face can be smaller than its hit area, never the reverse). */
  face: Record<ControlId, Circle>;
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

/** The scale that keeps the smallest button at least `minHit` on a short screen, and never above 1. */
const fit = (height: number, spec: TouchSpec): number => {
  const smallest = Math.min(spec.jump.d, spec.pogo.d, spec.fire.d);
  const floor = Math.min(1, spec.minHit / smallest);
  return Math.min(1, Math.max(floor, height / 360));
};

/** Places every control for a window of `width` × `height` CSS pixels with these safe-area insets. */
export function placeControls(
  width: number,
  height: number,
  insets: Insets,
  spec: TouchSpec = DEFAULT_TOUCH_SPEC,
): PlacedControls {
  const s = fit(height, spec) * spec.scale;
  // Right-handed puts the D-pad on the left. Left-handed lays everything out as a mirror image, with
  // the insets swapped, and flips x at the end.
  const mirror = spec.leftHanded;
  const left = mirror ? insets.right : insets.left;
  const right = mirror ? insets.left : insets.right;
  const flip = (x: number): number => (mirror ? width - x : x);

  const dpad: Circle = {
    cx: flip(left + (spec.dpad.left + spec.dpad.d / 2) * s),
    cy: height - insets.bottom - (spec.dpad.bottom + spec.dpad.d / 2) * s,
    r: (spec.dpad.d / 2) * s,
  };
  const button = (b: ButtonSpec): Circle => ({
    cx: flip(width - right - (b.right + b.d / 2) * s),
    cy: height - insets.bottom - (b.bottom + b.d / 2) * s,
    r: (b.d / 2) * s,
  });
  const jump = button(spec.jump);
  const pogo = button(spec.pogo);
  const fire = button(spec.fire);

  const pauseRect: Rect = {
    x: width - insets.right - spec.pause.right - spec.pause.hit,
    y: insets.top + spec.pause.top,
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
  };
}
