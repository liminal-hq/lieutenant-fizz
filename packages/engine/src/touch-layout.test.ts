// Tests for where the touch controls sit at phone sizes, with and without a display cutout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { Circle, ControlId, Shape } from './touch';
import { contains, undersizedTargets } from './touch';
import {
  DEFAULT_TOUCH_SPEC,
  controlSide,
  inside,
  placeControls,
  safeRect,
  sideGutters,
  sideTops,
  type Insets,
  type TouchSpec,
} from './touch-layout';

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH: Insets = { top: 0, right: 32, bottom: 20, left: 48 };
const SIZES: [number, number][] = [
  [844, 390],
  [740, 360],
  [640, 320],
  [1280, 720],
];
const IDS: ControlId[] = ['dpad', 'jump', 'pogo', 'fire', 'pause'];

/** The centre and a rough radius of a shape, to compare overlap. */
const circleOf = (s: Shape): Circle =>
  'r' in s ? s : { cx: s.x + s.w / 2, cy: s.y + s.h / 2, r: Math.max(s.w, s.h) / 2 };

describe('placeControls', () => {
  for (const [w, h] of SIZES) {
    for (const [name, insets] of [
      ['no insets', NONE],
      ['a notch', NOTCH],
    ] as const) {
      describe(`${w}×${h} with ${name}`, () => {
        const placed = placeControls(w, h, insets);
        const safe = safeRect(w, h, insets);

        it('gives every control a hit area of at least 48 dp', () => {
          expect(undersizedTargets(placed.hit)).toEqual([]);
        });

        it('keeps every hit area and face inside the safe area', () => {
          for (const id of IDS) {
            expect(inside(safe, placed.hit[id]), `${id} hit area`).toBe(true);
            expect(inside(safe, placed.face[id]), `${id} face`).toBe(true);
          }
        });

        it('overlaps no two hit areas, and leaves the faces 8 px apart', () => {
          for (let i = 0; i < IDS.length; i++) {
            for (let j = i + 1; j < IDS.length; j++) {
              const a = circleOf(placed.hit[IDS[i]!]);
              const b = circleOf(placed.hit[IDS[j]!]);
              expect(
                Math.hypot(a.cx - b.cx, a.cy - b.cy),
                `${IDS[i]} and ${IDS[j]} hit areas`,
              ).toBeGreaterThan(a.r + b.r);
              const fa = placed.face[IDS[i]!];
              const fb = placed.face[IDS[j]!];
              expect(
                Math.hypot(fa.cx - fb.cx, fa.cy - fb.cy) - fa.r - fb.r,
                `${IDS[i]} and ${IDS[j]} faces`,
              ).toBeGreaterThanOrEqual(8);
            }
          }
        });

        it('puts the controls where a right-handed thumb expects them', () => {
          const { face } = placed;
          expect(face.jump.r).toBeGreaterThanOrEqual(face.pogo.r);
          expect(face.jump.r).toBeGreaterThanOrEqual(face.fire.r);
          expect(face.pogo.cy).toBeLessThan(face.jump.cy); // Pogo above Jump
          expect(face.fire.cx).toBeLessThan(face.jump.cx); // Fizz left of Jump
          expect(face.dpad.cx).toBeLessThan(w / 2); // D-pad on the left half
          expect(face.jump.cx).toBeGreaterThan(w / 2);
          expect(face.pause.cx).toBeGreaterThan(w / 2); // Pause top right
          expect(face.pause.cy).toBeLessThan(h / 4);
        });

        it('hits the controls at their centres', () => {
          for (const id of IDS) {
            const c = placed.face[id];
            expect(contains(placed.hit[id], c.cx, c.cy), id).toBe(true);
          }
        });
      });
    }
  }

  it('is the 2a layout at the artboard size', () => {
    const { face } = placeControls(844, 360, NONE);
    expect(face.dpad).toEqual({ cx: 99, cy: 263, r: 75 });
    expect(face.jump).toEqual({ cx: 780, cy: 294, r: 40 });
  });

  it('never scales above 1 and stops shrinking when the smallest button reaches 48', () => {
    const tall = placeControls(1280, 1200, NONE).face;
    expect(tall.jump.r).toBe(40);
    const short = placeControls(500, 200, NONE).face;
    expect(short.pogo.r * 2).toBeGreaterThanOrEqual(48);
    expect(short.fire.r * 2).toBeGreaterThanOrEqual(48);
  });

  it('applies the Size multiplier', () => {
    const spec: TouchSpec = { ...DEFAULT_TOUCH_SPEC, scale: 1.25 };
    expect(placeControls(844, 390, NONE, spec).face.jump.r).toBe(50);
  });

  it('keeps menu content right of the D-pad and left of the buttons', () => {
    const placed = placeControls(844, 390, NONE);
    // The D-pad's right edge is 24 + 150 = 174 px from the left, plus a 16 px margin.
    expect(sideGutters(placed, 844, ['dpad', 'jump', 'pause'])).toEqual({ left: 190, right: 120 });
    // Without the D-pad nothing is kept on the left; Pause alone keeps 8 + 48 / 2 + 18 + 16.
    expect(sideGutters(placed, 844, ['pause'])).toEqual({ left: 0, right: 66 });
    expect(sideGutters(placed, 844, [])).toEqual({ left: 0, right: 0 });
    // A notch on the left moves the D-pad, and the gutter with it.
    expect(sideGutters(placeControls(844, 390, NOTCH), 844, ['dpad']).left).toBe(190 + NOTCH.left);
  });

  it('swaps the gutters for a left-handed layout', () => {
    const left = placeControls(844, 390, NONE, { ...DEFAULT_TOUCH_SPEC, leftHanded: true });
    const g = sideGutters(left, 844, ['dpad', 'jump']);
    expect(g).toEqual({ left: 120, right: 190 });
  });

  it('mirrors the layout, with the insets swapped, when left-handed', () => {
    const right = placeControls(844, 390, NOTCH);
    const left = placeControls(844, 390, NOTCH, { ...DEFAULT_TOUCH_SPEC, leftHanded: true });
    // The D-pad is now on the right and the buttons on the left, staying clear of the notch.
    expect(left.face.dpad.cx).toBeGreaterThan(844 / 2);
    expect(left.face.jump.cx).toBeLessThan(844 / 2);
    expect(inside(safeRect(844, 390, NOTCH), left.face.dpad)).toBe(true);
    expect(inside(safeRect(844, 390, NOTCH), left.face.jump)).toBe(true);
    // Heights are unchanged, and Pause stays top right.
    expect(left.face.jump.cy).toBe(right.face.jump.cy);
    expect(left.face.pause).toEqual(right.face.pause);
  });
});

describe('controlSide and sideTops', () => {
  const right = placeControls(844, 390, NONE);
  const left = placeControls(844, 390, NONE, { ...DEFAULT_TOUCH_SPEC, leftHanded: true });

  it('names the side a control is on', () => {
    expect(controlSide(right, 844, 'dpad')).toBe('left');
    expect(controlSide(right, 844, 'jump')).toBe('right');
    expect(controlSide(left, 844, 'dpad')).toBe('right');
    expect(controlSide(left, 844, 'jump')).toBe('left');
  });

  it('stops content 16 px above the highest low control on each side', () => {
    // The D-pad face is 150 px across with its centre 97 px up, so its top is at 390 - 22 - 150 = 218.
    // Jump is 80 px across with its bottom 26 px up, so its top is at 390 - 26 - 80 = 284.
    expect(sideTops(right, 844, 390, ['dpad', 'jump', 'pause'])).toEqual({ left: 202, right: 268 });
    // Pogo sits above Jump when it shows; the highest control wins.
    expect(sideTops(right, 844, 390, ['dpad', 'jump', 'pogo', 'pause']).right).toBe(
      Math.floor(390 - 118 - 62 - 16),
    );
  });

  it('is 0 for a side with no low control, and ignores Pause in the corner', () => {
    expect(sideTops(right, 844, 390, ['pause'])).toEqual({ left: 0, right: 0 });
    expect(sideTops(right, 844, 390, ['dpad'])).toEqual({ left: 202, right: 0 });
    expect(sideTops(right, 844, 390, [])).toEqual({ left: 0, right: 0 });
  });

  it('swaps the sides when left-handed', () => {
    expect(sideTops(left, 844, 390, ['dpad', 'jump'])).toEqual({ left: 268, right: 202 });
  });

  it('moves with a notch', () => {
    const notched = placeControls(844, 390, NOTCH);
    // The bottom inset lifts the D-pad by 20 px.
    expect(sideTops(notched, 844, 390, ['dpad']).left).toBe(182);
    const flipped = placeControls(844, 390, NOTCH, { ...DEFAULT_TOUCH_SPEC, leftHanded: true });
    expect(sideTops(flipped, 844, 390, ['dpad']).right).toBe(182);
  });
});
