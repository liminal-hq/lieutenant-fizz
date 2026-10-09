// Tests for the default lift of the touch controls while the browser's bars are gone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { undersizedTargets } from './touch';
import {
  CHROMELESS_LIFT,
  DEFAULT_TOUCH_SPEC,
  controlZone,
  dragOffset,
  inside,
  placeControls,
  safeRect,
  validPlacement,
  type Insets,
  type MovableId,
  type TouchSpec,
} from './touch-layout';

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH: Insets = { top: 0, right: 32, bottom: 20, left: 48 };
const MOVABLE: MovableId[] = ['dpad', 'jump', 'pogo', 'fire'];
const SIZES: [number, number][] = [
  [844, 390],
  [740, 360],
  [640, 320],
];
const lifted: TouchSpec = { ...DEFAULT_TOUCH_SPEC, lift: CHROMELESS_LIFT };

/** How far each control's centre is from the bottom of the window, plus `extra` for what lies below it. */
const fromBottom = (
  w: number,
  h: number,
  spec: TouchSpec,
  extra = 0,
  insets = NONE,
): Record<MovableId, number> => {
  const p = placeControls(w, h, insets, spec);
  const out = {} as Record<MovableId, number>;
  for (const id of MOVABLE) out[id] = h - p.face[id].cy + extra;
  return out;
};

describe('the default lift', () => {
  it('leaves the placement alone when the lift is 0', () => {
    for (const [w, h] of SIZES) {
      expect(placeControls(w, h, NOTCH, { ...DEFAULT_TOUCH_SPEC, lift: 0 })).toEqual(
        placeControls(w, h, NOTCH),
      );
    }
  });

  it('raises every default control by the same amount', () => {
    const before = fromBottom(844, 390, DEFAULT_TOUCH_SPEC);
    const after = fromBottom(844, 390, lifted);
    for (const id of MOVABLE) expect(after[id] - before[id], id).toBeCloseTo(CHROMELESS_LIFT, 6);
  });

  it('puts the 844×390 fullscreen controls where the browser-bar layout had them', () => {
    // The browser-bar layout: a window 304 px tall above a bar of about 65 dp, measured on a phone.
    // The distances are from the bottom of the phone, so the bar is added to the window's own.
    const target = fromBottom(844, 304, DEFAULT_TOUCH_SPEC, 65);
    const now = fromBottom(844, 390, lifted);
    // Measured on the phone: D-pad 147, Jump 121, Pogo 191, Fizz 117.
    expect(target.dpad).toBeCloseTo(147, 0);
    expect(target.jump).toBeCloseTo(121, 0);
    // The window is taller, so the controls are bigger and the cluster spreads a little further
    // apart; the lift fits the D-pad and Jump (where the thumbs rest) to within 3 dp.
    expect(Math.abs(now.dpad - target.dpad)).toBeLessThanOrEqual(3);
    expect(Math.abs(now.jump - target.jump)).toBeLessThanOrEqual(4);
    expect(Math.abs(now.fire - target.fire)).toBeLessThanOrEqual(6);
    expect(Math.abs(now.pogo - target.pogo)).toBeLessThanOrEqual(12);
    // Before the change they sat 30 to 50 dp lower.
    const old = fromBottom(844, 390, DEFAULT_TOUCH_SPEC);
    for (const id of MOVABLE) expect(target[id] - old[id], id).toBeGreaterThanOrEqual(25);
  });

  it('lifts less on shorter windows', () => {
    const rise = (w: number, h: number): number =>
      fromBottom(w, h, lifted).dpad - fromBottom(w, h, DEFAULT_TOUCH_SPEC).dpad;
    expect(rise(844, 390)).toBeCloseTo(CHROMELESS_LIFT, 6);
    expect(rise(740, 360)).toBeLessThan(rise(844, 390));
    expect(rise(640, 320)).toBeLessThan(rise(740, 360));
    expect(rise(640, 320)).toBeGreaterThan(30);
  });

  it('leaves Pause where it is', () => {
    for (const [w, h] of SIZES) {
      const a = placeControls(w, h, NOTCH);
      const b = placeControls(w, h, NOTCH, lifted);
      expect(b.hit.pause).toEqual(a.hit.pause);
      expect(b.face.pause).toEqual(a.face.pause);
    }
  });

  for (const [w, h] of SIZES) {
    for (const [iname, insets] of [
      ['no insets', NONE],
      ['a notch', NOTCH],
    ] as const) {
      for (const hand of [false, true]) {
        for (const scale of [0.85, 1, 1.2]) {
          const spec: TouchSpec = { ...lifted, leftHanded: hand, scale };
          const label = `${w}×${h}, ${iname}, ${hand ? 'left' : 'right'}-handed, size ×${scale}`;
          it(`keeps every placement rule at ${label}`, () => {
            const p = placeControls(w, h, insets, spec);
            expect(validPlacement(p, safeRect(w, h, insets), spec.reserve.gap)).toBe(true);
            expect(undersizedTargets(p.hit)).toEqual([]);
            for (const id of ['jump', 'pogo', 'fire'] as const) {
              expect(p.face[id].r * 2).toBeGreaterThanOrEqual(48 - 1e-6);
            }
            // Nothing climbs into the band the HUD pills and Pause use.
            for (const id of MOVABLE) {
              expect(p.face[id].cy - p.face[id].r).toBeGreaterThanOrEqual(
                insets.top + spec.reserve.top - 1e-6,
              );
              // Every default place is inside its own zone.
              const z = controlZone(id, w, h, insets, spec);
              expect(p.face[id].cx).toBeGreaterThanOrEqual(z.x - 1e-6);
              expect(p.face[id].cx).toBeLessThanOrEqual(z.x + z.w + 1e-6);
              expect(p.face[id].cy).toBeGreaterThanOrEqual(z.y - 1e-6);
              expect(p.face[id].cy).toBeLessThanOrEqual(z.y + z.h + 1e-6);
            }
            // The sides are not changed by the lift, only the heights.
            const flat = placeControls(w, h, insets, { ...spec, lift: 0 });
            for (const id of MOVABLE) expect(p.face[id].cx).toBeCloseTo(flat.face[id].cx, 6);
            // Every hit area is inside the window.
            for (const id of MOVABLE) expect(inside(safeRect(w, h, insets), p.hit[id])).toBe(true);
          });
        }
      }
    }
  }

  it('stops short of the top band when a large size leaves no room', () => {
    const spec: TouchSpec = { ...lifted, scale: 1.2, lift: 200 };
    const p = placeControls(640, 320, NONE, spec);
    const top = Math.min(...MOVABLE.map((id) => p.face[id].cy - p.face[id].r));
    expect(top).toBeGreaterThanOrEqual(spec.reserve.top - 1e-6);
  });
});

describe('moved controls and the lift', () => {
  const moved: TouchSpec = {
    ...lifted,
    moved: { dpad: { side: 60, bottom: 30 } },
  };

  it('leaves a moved control where its stored offset puts it, lifted or not', () => {
    const a = placeControls(844, 390, NONE, { ...moved, lift: 0 });
    const b = placeControls(844, 390, NONE, moved);
    expect(a.custom).toBe(true);
    expect(b.custom).toBe(true);
    expect(b.face.dpad).toEqual(a.face.dpad);
    // The controls that were not moved take the lift.
    expect(a.face.jump.cy - b.face.jump.cy).toBeCloseTo(CHROMELESS_LIFT, 6);
  });

  it('does not shift a saved layout in which every control was moved', () => {
    const everyone: TouchSpec['moved'] = {
      dpad: { side: 40, bottom: 20 },
      jump: { side: 20, bottom: 24 },
      pogo: { side: 30, bottom: 120 },
      fire: { side: 110, bottom: 28 },
    };
    const a = placeControls(844, 390, NONE, { ...DEFAULT_TOUCH_SPEC, moved: everyone });
    const b = placeControls(844, 390, NONE, { ...lifted, moved: everyone });
    expect(a.custom).toBe(true);
    expect(b).toEqual(a);
  });

  it('drops a moved control exactly where the finger wants it while lifted', () => {
    const p = placeControls(844, 390, NONE, lifted);
    const want = { cx: 130, cy: 250 };
    const off = dragOffset(p, 'dpad', want, 844, 390, NONE, lifted);
    expect(off).not.toBeNull();
    const after = placeControls(844, 390, NONE, { ...lifted, moved: { dpad: off! } });
    expect(after.custom).toBe(true);
    expect(Math.abs(after.face.dpad.cx - want.cx)).toBeLessThan(1.5);
    expect(Math.abs(after.face.dpad.cy - want.cy)).toBeLessThan(1.5);
  });
});
