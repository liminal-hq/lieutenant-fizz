// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, type Grid } from '@lieutenant-fizz/engine';

export type BenPose = 'stand' | 'run1' | 'run2' | 'jump' | 'shoot' | 'pogo' | 'pogo2';

/** Ben "Lieutenant Fizz" Blaze: bicycle helmet, red shirt, 16x24 (16x32 on the pogo stick). */
export function ben(pose: BenPose): Grid {
  const pogo = pose.startsWith('pogo');
  const H = pogo ? 32 : 24;
  const p = new Pen(16, H);
  const o = pose === 'pogo2' ? 2 : 0;
  const R = (x: number, y: number, w: number, h: number, c: Parameters<Pen['rect']>[4]): Pen =>
    p.rect(x, y + o, w, h, c);
  const P = (x: number, y: number, c: Parameters<Pen['px']>[2]): Pen => p.px(x, y + o, c);
  if (pogo) {
    p.rect(7, 12 + o, 2, H - 13 - o, 'L');
    for (let y = 24; y < 29; y += 2) p.rect(6, y, 4, 1, 'D');
    p.rect(4, 21 + o, 8, 1, 'D');
    p.rect(5, 12 + o, 6, 1, 'D');
    p.rect(7, H - 1, 2, 1, 'D');
  }
  p.ell(8, 5 + o, 5.5, 4.6, 'g', (_i, j) => j <= 5 + o);
  R(3, 5, 12, 1, 'G');
  R(6, 2, 4, 1, 'W');
  P(5, 3, 'G');
  P(8, 3, 'G');
  P(11, 3, 'G');
  R(5, 6, 7, 4, 'W');
  P(4, 7, 'W');
  P(9, 7, 'k');
  P(11, 7, 'k');
  P(12, 8, 'W');
  P(10, 9, 'r');
  P(5, 8, 'D');
  P(5, 9, 'D');
  R(4, 10, 8, 6, 'r');
  R(4, 15, 8, 1, 'R');
  R(6, 10, 4, 1, 'W');
  R(7, 12, 2, 2, 'y');
  if (pose === 'shoot') {
    R(10, 11, 4, 2, 'r');
    R(12, 10, 4, 3, 'c');
    P(15, 10, 'W');
    R(3, 11, 2, 4, 'R');
  } else if (pogo) {
    R(9, 11, 2, 2, 'r');
    P(10, 12, 'W');
    R(3, 11, 2, 4, 'R');
  } else {
    R(3, 11, 2, 4, 'R');
    R(11, 11, 2, 4, 'r');
    P(11, 15, 'W');
    P(12, 15, 'W');
  }
  if (pose === 'run1') {
    R(5, 16, 6, 2, 'B');
    R(4, 18, 2, 3, 'B');
    R(2, 21, 4, 2, 'R');
    R(10, 18, 2, 3, 'B');
    R(11, 20, 4, 2, 'R');
    P(10, 18, 'b');
  } else if (pose === 'run2') {
    R(5, 16, 6, 2, 'B');
    R(6, 18, 4, 4, 'B');
    R(6, 22, 5, 2, 'R');
    P(7, 18, 'b');
  } else if (pose === 'jump') {
    R(5, 16, 6, 3, 'B');
    R(4, 19, 3, 2, 'R');
    R(10, 17, 3, 2, 'B');
    R(12, 16, 3, 2, 'R');
  } else if (pogo) {
    R(5, 16, 6, 2, 'B');
    R(5, 18, 2, 3, 'B');
    R(9, 18, 2, 3, 'B');
    R(4, 20, 3, 1, 'R');
    R(9, 20, 3, 1, 'R');
  } else {
    R(5, 16, 6, 2, 'B');
    R(5, 18, 2, 4, 'B');
    R(9, 18, 2, 4, 'B');
    R(4, 22, 4, 2, 'R');
    R(9, 22, 4, 2, 'R');
    P(5, 18, 'b');
  }
  return p.outline();
}

/** Ben on the overworld map: a 16x16 head-and-shoulders walker. */
export function benMap(f: 0 | 1): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 5, 5, 4.2, 'g', (_i, j) => j <= 5);
  p.rect(3, 5, 10, 1, 'G');
  p.rect(6, 2, 4, 1, 'W');
  p.rect(4, 6, 8, 3, 'W');
  p.px(6, 7, 'k');
  p.px(9, 7, 'k');
  p.rect(4, 9, 8, 3, 'r');
  p.rect(6, 9, 4, 1, 'W');
  if (f) {
    p.rect(5, 12, 2, 2, 'B');
    p.rect(9, 12, 2, 1, 'B');
    p.rect(4, 14, 3, 1, 'R');
    p.rect(9, 13, 3, 1, 'R');
  } else {
    p.rect(5, 12, 2, 1, 'B');
    p.rect(9, 12, 2, 2, 'B');
    p.rect(4, 13, 3, 1, 'R');
    p.rect(9, 14, 3, 1, 'R');
  }
  return p.outline();
}

/** Billy, in his football helmet; optionally behind the cage bars. */
export function billy(caged: boolean): Grid {
  const p = new Pen(16, 24);
  p.ell(8, 7, 4.5, 4, 'y', (_i, j) => j <= 8);
  p.rect(7, 3, 2, 6, 'R');
  p.rect(4, 8, 9, 1, 'N');
  p.rect(5, 9, 6, 4, 'W');
  p.px(7, 10, 'k');
  p.px(9, 10, 'k');
  p.px(8, 12, 'r');
  p.rect(4, 10, 1, 2, 'L');
  p.rect(11, 10, 1, 2, 'L');
  p.rect(4, 13, 8, 5, 'g');
  p.rect(4, 17, 8, 1, 'G');
  p.rect(3, 14, 1, 3, 'g');
  p.rect(12, 14, 1, 3, 'g');
  p.rect(5, 18, 2, 4, 'B');
  p.rect(9, 18, 2, 4, 'B');
  p.rect(4, 22, 3, 2, 'W');
  p.rect(9, 22, 3, 2, 'W');
  p.outline();
  if (caged) {
    p.rect(0, 0, 16, 2, 'D');
    p.rect(0, 22, 16, 2, 'D');
    for (let x = 0; x < 16; x += 3) p.rect(x, 2, 1, 20, 'L');
    p.rect(0, 1, 16, 1, 'L');
  }
  return p;
}
