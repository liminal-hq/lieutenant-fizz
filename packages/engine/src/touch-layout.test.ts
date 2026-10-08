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
  controlZone,
  inside,
  placeControls,
  safeRect,
  sideGutters,
  sideTops,
  validPlacement,
  type EdgeOffset,
  type Insets,
  type MovableId,
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

        it('draws the Jump, Pogo and Fizz faces at least 48 dp across', () => {
          for (const id of ['jump', 'pogo', 'fire'] as const) {
            expect(placed.face[id].r * 2, id).toBeGreaterThanOrEqual(48);
          }
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

  it('keeps Small buttons at 48 dp on a short screen', () => {
    const small: TouchSpec = { ...DEFAULT_TOUCH_SPEC, scale: 0.85 };
    for (const h of [320, 300, 200]) {
      const { face } = placeControls(640, h, NONE, small);
      for (const id of ['jump', 'pogo', 'fire'] as const) {
        expect(face[id].r * 2, `${id} at ${h}`).toBeGreaterThanOrEqual(48 - 1e-9);
      }
    }
    // On a tall screen Small is still 0.85 of the artboard.
    expect(placeControls(844, 390, NONE, small).face.jump.r).toBeCloseTo(34, 9);
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
    expect(sideTops(right, 844, ['dpad', 'jump', 'pause'])).toEqual({ left: 202, right: 268 });
    // Pogo sits above Jump when it shows; the highest control wins.
    expect(sideTops(right, 844, ['dpad', 'jump', 'pogo', 'pause']).right).toBe(
      Math.floor(390 - 118 - 62 - 16),
    );
  });

  it('is 0 for a side with no low control, and ignores Pause in the corner', () => {
    expect(sideTops(right, 844, ['pause'])).toEqual({ left: 0, right: 0 });
    expect(sideTops(right, 844, ['dpad'])).toEqual({ left: 202, right: 0 });
    expect(sideTops(right, 844, [])).toEqual({ left: 0, right: 0 });
  });

  it('counts a raised D-pad, and skips Pause by id rather than by height', () => {
    const raised = placeControls(844, 390, NONE, {
      ...DEFAULT_TOUCH_SPEC,
      moved: { dpad: { side: 75, bottom: 115 } },
    });
    // The face is centred at y 200 with r 75, so its top is 125 and content stops at 109.
    expect(sideTops(raised, 844, ['dpad', 'jump', 'pause'])).toEqual({ left: 109, right: 268 });
    // Pause is the only control skipped, even though a raised control is in the upper half.
    expect(sideTops(raised, 844, ['pause'])).toEqual({ left: 0, right: 0 });
  });

  it('swaps the sides when left-handed', () => {
    expect(sideTops(left, 844, ['dpad', 'jump'])).toEqual({ left: 268, right: 202 });
  });

  it('moves with a notch', () => {
    const notched = placeControls(844, 390, NOTCH);
    // The bottom inset lifts the D-pad by 20 px.
    expect(sideTops(notched, 844, ['dpad']).left).toBe(182);
    const flipped = placeControls(844, 390, NOTCH, { ...DEFAULT_TOUCH_SPEC, leftHanded: true });
    expect(sideTops(flipped, 844, ['dpad']).right).toBe(182);
  });
});

describe('moved controls', () => {
  const moved = (m: Partial<Record<MovableId, EdgeOffset>>, extra: Partial<TouchSpec> = {}) => ({
    ...DEFAULT_TOUCH_SPEC,
    moved: m,
    ...extra,
  });

  it('is the default layout, and not custom, when nothing moved', () => {
    const base = placeControls(844, 390, NONE);
    expect(base.custom).toBe(false);
    expect(base.face.dpad).toEqual({ cx: 99, cy: 293, r: 75 });
    expect(placeControls(844, 390, NONE, moved({})).custom).toBe(false);
    expect(placeControls(844, 390, NONE, moved({})).face).toEqual(base.face);
  });

  it('has the D-pad zone x 91 to 181 and y 171 to 299 at 844×390', () => {
    expect(controlZone('dpad', 844, 390, NONE)).toEqual({ x: 91, y: 171, w: 90, h: 128 });
  });

  it('keeps every default place inside its zone', () => {
    for (const [w, h] of SIZES) {
      for (const insets of [NONE, NOTCH]) {
        for (const leftHanded of [false, true]) {
          const spec = { ...DEFAULT_TOUCH_SPEC, leftHanded };
          const p = placeControls(w, h, insets, spec);
          for (const id of ['dpad', 'jump', 'pogo', 'fire'] as const) {
            const z = controlZone(id, w, h, insets, spec);
            const c = p.face[id];
            const where = `${id} ${w}×${h} ${leftHanded ? 'left' : 'right'}`;
            expect(c.cx, where).toBeGreaterThanOrEqual(z.x - 1e-9);
            expect(c.cx, where).toBeLessThanOrEqual(z.x + z.w + 1e-9);
            expect(c.cy, where).toBeGreaterThanOrEqual(z.y - 1e-9);
            expect(c.cy, where).toBeLessThanOrEqual(z.y + z.h + 1e-9);
          }
        }
      }
    }
  });

  it('places a D-pad at (150, 200) and leaves 483 px for Options', () => {
    // 150 - 75 = 75 from the left edge; 390 - 200 - 75 = 115 up from the bottom.
    const p = placeControls(844, 390, NONE, moved({ dpad: { side: 75, bottom: 115 } }));
    expect(p.custom).toBe(true);
    expect(p.face.dpad).toEqual({ cx: 150, cy: 200, r: 75 });
    const g = sideGutters(p, 844, ['dpad', 'jump', 'pause']);
    expect(g.left).toBe(241);
    expect(844 - g.left - g.right).toBe(483);
  });

  it('clamps the same offset into the zone at 740×360 and keeps the stored value', () => {
    const spec = moved({ dpad: { side: 75, bottom: 115 } });
    const p = placeControls(740, 360, NONE, spec);
    expect(p.face.dpad).toEqual({ cx: 129, cy: 171, r: 75 });
    expect(spec.moved?.dpad).toEqual({ side: 75, bottom: 115 });
  });

  it('clamps an offset of 2000 to the zone corner', () => {
    const p = placeControls(844, 390, NONE, moved({ dpad: { side: 2000, bottom: 2000 } }));
    expect(p.custom).toBe(true);
    expect(p.face.dpad.cy).toBe(0 + 96 + 75);
    expect(p.face.dpad.cx).toBe(181);
    const q = placeControls(844, 390, NONE, moved({ jump: { side: 2000, bottom: 200 } }));
    const z = controlZone('jump', 844, 390, NONE);
    expect(q.face.jump.cx).toBeCloseTo(z.x, 9);
  });

  it('falls back to the defaults for the whole layout when two controls overlap', () => {
    const same = { side: 30, bottom: 30 };
    const base = placeControls(844, 390, NONE);
    const p = placeControls(
      844,
      390,
      NONE,
      moved({ jump: same, pogo: same, dpad: { side: 75, bottom: 115 } }),
    );
    expect(p.custom).toBe(false);
    expect(p.face).toEqual(base.face);
    expect(p.hit).toEqual(base.hit);
  });

  it('validPlacement rejects overlap, closeness and a hit area outside the safe rectangle', () => {
    const safe = safeRect(844, 390, NONE);
    const ok = placeControls(844, 390, NONE);
    expect(validPlacement(ok, safe, 8)).toBe(true);
    expect(validPlacement(ok, { ...safe, w: 700 }, 8)).toBe(false);
    expect(validPlacement(ok, safe, 500)).toBe(false);
    const stacked = {
      ...ok,
      face: { ...ok.face, pogo: ok.face.jump },
      hit: { ...ok.hit, pogo: ok.hit.jump },
    };
    expect(validPlacement(stacked, safe, 8)).toBe(false);
  });

  it('mirrors a custom position when left-handed', () => {
    const m = { dpad: { side: 75, bottom: 115 }, jump: { side: 200, bottom: 150 } };
    const right = placeControls(844, 390, NONE, moved(m));
    const left = placeControls(844, 390, NONE, moved(m, { leftHanded: true }));
    expect(left.custom).toBe(true);
    expect(left.face.dpad.cx).toBe(844 - right.face.dpad.cx);
    expect(left.face.jump.cx).toBe(844 - right.face.jump.cx);
    expect(left.face.dpad.cy).toBe(right.face.dpad.cy);
  });

  it('scales a custom layout about its corner with the Size setting', () => {
    const m = moved({ dpad: { side: 40, bottom: 115 } }, { scale: 1.2 });
    const p = placeControls(844, 390, NONE, m);
    // The face edge stays 40 × 1.2 from the left.
    expect(p.face.dpad.cx - p.face.dpad.r).toBeCloseTo(48, 9);
  });

  it('keeps the moved D-pad at its distance from a notch', () => {
    const p = placeControls(844, 390, NOTCH, moved({ dpad: { side: 40, bottom: 115 } }));
    expect(p.face.dpad.cx - p.face.dpad.r).toBeCloseTo(NOTCH.left + 40, 9);
    expect(p.hit.dpad.cx - p.hit.dpad.r).toBeGreaterThanOrEqual(NOTCH.left + 8);
  });
});

describe('placement invariants', () => {
  const windows: [number, number][] = [
    [844, 390],
    [740, 360],
    [640, 320],
    [915, 412],
  ];
  const offsetSets: [string, Partial<Record<MovableId, EdgeOffset>>][] = [
    ['none', {}],
    [
      'all 0',
      {
        dpad: { side: 0, bottom: 0 },
        jump: { side: 0, bottom: 0 },
        pogo: { side: 0, bottom: 0 },
        fire: { side: 0, bottom: 0 },
      },
    ],
    [
      'all 2000',
      {
        dpad: { side: 2000, bottom: 2000 },
        jump: { side: 2000, bottom: 2000 },
        pogo: { side: 2000, bottom: 2000 },
        fire: { side: 2000, bottom: 2000 },
      },
    ],
    ['D-pad at 0', { dpad: { side: 0, bottom: 0 } }],
    ['D-pad at 2000', { dpad: { side: 2000, bottom: 2000 } }],
    ['Jump at 2000', { jump: { side: 2000, bottom: 2000 } }],
    ['Fizz at 2000', { fire: { side: 2000, bottom: 2000 } }],
    ['overlapping', { jump: { side: 40, bottom: 40 }, pogo: { side: 40, bottom: 40 } }],
    [
      'inward max',
      {
        dpad: { side: 2000, bottom: 0 },
        jump: { side: 2000, bottom: 0 },
        pogo: { side: 2000, bottom: 200 },
        fire: { side: 2000, bottom: 400 },
      },
    ],
  ];
  const sizes = [0.85, 1, 1.2];
  const ids: ControlId[] = ['dpad', 'jump', 'pogo', 'fire', 'pause'];

  for (const [w, h] of windows) {
    for (const [iname, insets] of [
      ['no insets', NONE],
      ['a notch', NOTCH],
    ] as const) {
      for (const scale of sizes) {
        for (const leftHanded of [false, true]) {
          for (const [oname, m] of offsetSets) {
            const name = `${w}×${h}, ${iname}, ×${scale}, ${leftHanded ? 'left' : 'right'}-handed, ${oname}`;
            it(name, () => {
              const spec: TouchSpec = { ...DEFAULT_TOUCH_SPEC, scale, leftHanded, moved: m };
              const p = placeControls(w, h, insets, spec);
              const safe = safeRect(w, h, insets);
              // The D-pad alone cannot reach another control, so these sets must keep their custom placement
              // (the clamping is what is being checked, not the fallback).
              if (oname.startsWith('D-pad')) {
                expect(p.custom, 'custom').toBe(true);
              }
              expect(undersizedTargets(p.hit)).toEqual([]);
              for (const id of ids) expect(inside(safe, p.hit[id]), `${id} hit inside`).toBe(true);
              for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                  const a = circleOf(p.hit[ids[i]!]!);
                  const b = circleOf(p.hit[ids[j]!]!);
                  expect(
                    Math.hypot(a.cx - b.cx, a.cy - b.cy),
                    `${ids[i]} and ${ids[j]} hit areas`,
                  ).toBeGreaterThan(a.r + b.r - 1e-6);
                  const fa = p.face[ids[i]!];
                  const fb = p.face[ids[j]!];
                  expect(
                    Math.hypot(fa.cx - fb.cx, fa.cy - fb.cy) - fa.r - fb.r,
                    `${ids[i]} and ${ids[j]} faces`,
                  ).toBeGreaterThanOrEqual(8 - 1e-6);
                }
              }
              if (p.custom) {
                for (const id of ['dpad', 'jump', 'pogo', 'fire'] as const) {
                  if (m[id]) {
                    expect(
                      p.face[id].cy - p.face[id].r,
                      `${id} below the top band`,
                    ).toBeGreaterThanOrEqual(safe.y + 96 - 1e-6);
                  }
                }
              }
              const menu = sideGutters(p, w, ['dpad', 'jump', 'pause']);
              const base = sideGutters(placeControls(w, h, insets, { ...spec, moved: {} }), w, [
                'dpad',
                'jump',
                'pause',
              ]);
              expect(menu.left + menu.right).toBeLessThanOrEqual(
                Math.max(w - 300, base.left + base.right) + 1e-6,
              );
            });
          }
        }
      }
    }
  }
});
