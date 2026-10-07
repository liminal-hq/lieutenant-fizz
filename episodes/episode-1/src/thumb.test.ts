// Tests for the save-slot thumbnail pixels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { thumbPixels, type ThumbData } from './thumb';

/** A 4x3 map: row 0 (south) is grass of area 1, row 1 has a river and a node, row 2 is grass. */
const data: ThumbData = {
  w: 4,
  h: 3,
  cells: Uint8Array.from([
    0x10,
    0x10,
    0x10,
    0x10, // y = 0
    0x00,
    0x01,
    0x32,
    0x00, // y = 1: grass area 0, river, node of level 3, grass
    0x00,
    0x00,
    0x00,
    0x00, // y = 2
  ]),
};

const px = (a: Uint8ClampedArray, w: number, x: number, row: number): number[] =>
  Array.from(a.slice((row * w + x) * 4, (row * w + x) * 4 + 4));

describe('thumbPixels', () => {
  it('is one opaque RGBA pixel per tile', () => {
    const a = thumbPixels(data, 0);
    expect(a.length).toBe(4 * 3 * 4);
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
  });

  it('puts the south at the bottom of the image', () => {
    const a = thumbPixels(data, 0);
    // y = 0 (area 1, pink) is the last image row; y = 2 (area 0, green) is the first.
    expect(px(a, 4, 0, 2)).toEqual([0xf2, 0x9b, 0xc3, 255]);
    expect(px(a, 4, 0, 0)).toEqual([0x2e, 0x9d, 0x3f, 255]);
  });

  it('draws rivers brown', () => {
    expect(px(thumbPixels(data, 0), 4, 1, 1)).toEqual([0x6b, 0x3f, 0x1f, 255]);
  });

  it('lights a node orange once its level is cleared', () => {
    expect(px(thumbPixels(data, 0), 4, 2, 1)).toEqual([255, 255, 255, 255]);
    expect(px(thumbPixels(data, 1 << 3), 4, 2, 1)).toEqual([0xff, 0xaa, 0x40, 255]);
    expect(px(thumbPixels(data, 1 << 2), 4, 2, 1)).toEqual([255, 255, 255, 255]);
  });

  it('marks Ben with a rose square at the saved position and clips at the edges', () => {
    const a = thumbPixels(data, 0, { x: 0.4, y: 0.9 });
    expect(px(a, 4, 0, 2)).toEqual([0xf4, 0x3f, 0x5e, 255]);
    expect(px(a, 4, 1, 1)).toEqual([0xf4, 0x3f, 0x5e, 255]);
    expect(() => thumbPixels(data, 0, { x: 3.5, y: 2.5 })).not.toThrow();
    expect(() => thumbPixels(data, 0, { x: -9, y: 40 })).not.toThrow();
  });
});
