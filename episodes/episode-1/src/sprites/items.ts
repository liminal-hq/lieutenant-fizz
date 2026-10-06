// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, type Grid } from '@lieutenant-fizz/engine/pen';
import type { Colour } from '@lieutenant-fizz/engine/palette';

export function cheezie(): Grid {
  const p = new Pen(16, 16);
  p.rect(4, 3, 8, 11, 'y');
  p.rect(4, 2, 8, 1, 'r');
  p.rect(4, 14, 8, 1, 'r');
  p.rect(4, 5, 8, 2, 'r');
  for (const [x, y] of [
    [6, 9],
    [7, 10],
    [9, 8],
    [10, 11],
    [6, 12],
  ] as const) {
    p.px(x, y, 'N');
    p.px(x + 1, y, 'N');
  }
  p.px(5, 4, 'W');
  return p.outline();
}

export function choc(): Grid {
  const p = new Pen(16, 16);
  p.rect(1, 5, 14, 6, 'N');
  p.rect(1, 5, 2, 6, 'r');
  p.rect(13, 5, 2, 6, 'r');
  p.rect(3, 7, 10, 1, 'y');
  p.rect(4, 9, 8, 1, 'R');
  p.px(0, 6, 'r');
  p.px(0, 9, 'r');
  p.px(15, 6, 'r');
  p.px(15, 9, 'r');
  return p.outline();
}

export function cookie(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 8, 6.5, 6.5, 'N');
  p.ell(8, 8, 4.2, 4.2, 'R');
  p.ell(8, 8, 2, 2, 'N');
  for (const [x, y] of [
    [3, 8],
    [8, 3],
    [13, 8],
    [8, 13],
    [5, 5],
    [11, 5],
    [5, 11],
    [11, 11],
  ] as const) {
    p.px(x, y, 'y');
  }
  return p.outline();
}

export function soda(): Grid {
  const p = new Pen(16, 16);
  p.rect(5, 3, 6, 11, 'r');
  p.rect(5, 2, 6, 1, 'L');
  p.rect(5, 14, 6, 1, 'L');
  p.rect(5, 7, 6, 2, 'W');
  p.px(6, 4, 'W');
  p.px(9, 11, 'c');
  p.px(8, 12, 'c');
  return p.outline();
}

export function gumdrop(c: Colour, s: Colour): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 11, 5, 6, c, (_i, j) => j <= 13);
  p.px(6, 8, 'W');
  p.px(9, 7, 'W');
  p.px(10, 11, 'W');
  p.px(5, 11, s);
  return p.outline();
}

export function usb(): Grid {
  const p = new Pen(16, 16);
  p.rect(2, 6, 9, 5, 'y');
  p.rect(11, 7, 4, 3, 'L');
  p.px(12, 8, 'D');
  p.px(14, 8, 'D');
  p.rect(3, 6, 7, 1, 'W');
  p.px(4, 8, 'N');
  p.px(6, 8, 'N');
  return p.outline();
}
