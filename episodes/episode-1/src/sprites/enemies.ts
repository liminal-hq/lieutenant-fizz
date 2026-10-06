// Pixel-art frames for the Episode 1 enemies and boss.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, spriteRng, type Grid } from '@lieutenant-fizz/engine';

export type Frame = 0 | 1;

export function gloop(f: Frame): Grid {
  const p = new Pen(16, 16);
  const rx = f ? 7 : 6;
  const ry = f ? 3.2 : 4;
  const top = 15 - 2 * ry;
  p.ell(8, 15 - ry, rx, ry, 'g');
  p.fn((_x, y, c) => (c === 'g' && y >= 14 ? 'G' : undefined));
  p.px(5, 13, 'y');
  p.px(9, 14, 'y');
  p.px(7, 12, 'W');
  p.rect(11, top - 2, 1, 3, 'g');
  p.ell(11.5, top - 3, 1.9, 1.9, 'W');
  p.px(12, top - 3, 'k');
  return p.outline();
}

export function hopper(f: Frame): Grid {
  const p = new Pen(16, 16);
  const cy = f ? 6 : 9;
  if (f) {
    p.rect(4, 10, 1, 4, 'N');
    p.rect(11, 10, 1, 4, 'N');
    p.rect(3, 14, 3, 1, 'N');
    p.rect(10, 14, 3, 1, 'N');
  } else {
    p.rect(3, 13, 4, 2, 'N');
    p.rect(9, 13, 4, 2, 'N');
  }
  p.ell(8, cy, 5.5, 4.8, 'y');
  p.px(5, cy, 'N');
  p.px(6, cy + 2, 'N');
  p.px(9, cy + 2, 'N');
  p.px(4, cy - 2, 'N');
  p.ell(10, cy - 1, 1.8, 1.8, 'W');
  p.px(10, cy - 1, 'k');
  p.px(12, cy + 1, 'R');
  return p.outline();
}

export function marsh(f: Frame): Grid {
  const p = new Pen(16, 16);
  if (f) p.ell(8, 11.5, 7, 3.6, 'W');
  else p.ell(8, 9.5, 5.5, 5.6, 'W');
  p.fn((_x, y, c) => (c === 'W' && y >= 13 ? 'm' : undefined));
  const ey = f ? 10 : 8;
  p.px(6, ey, 'k');
  p.px(10, ey, 'k');
  p.px(8, ey + 2, 'M');
  p.px(5, ey - 2, 'L');
  return p.outline();
}

export function beetle(f: Frame): Grid {
  const p = new Pen(16, 16);
  for (let i = 0; i < 3; i++) p.rect(4 + i * 3 + (f ? 1 : 0), 13, 1, 2, 'D');
  p.ell(7, 11, 6, 4.5, 'N', (_i, j) => j <= 12);
  p.line(7, 7, 7, 12, 'R');
  p.px(4, 9, 'y');
  p.px(9, 9, 'y');
  p.ell(12.5, 11, 2.6, 2.2, 'D');
  p.px(13, 10, 'r');
  p.px(15, 9, 'y');
  p.px(14, 10, 'L');
  return p.outline();
}

export function bat(f: Frame): Grid {
  const p = new Pen(16, 16);
  if (!f) {
    p.ell(8, 6, 3, 4.5, 'M');
    p.rect(4, 2, 2, 7, 'C');
    p.rect(10, 2, 2, 7, 'C');
    p.px(5, 1, 'c');
    p.px(10, 1, 'c');
    p.px(7, 0, 'D');
    p.px(9, 0, 'D');
    p.px(7, 8, 'r');
    p.px(9, 8, 'r');
  } else {
    p.fn((x, y) => {
      if (y < 4 || y > 10) return undefined;
      const d = Math.abs(x + 0.5 - 8);
      if (d >= 2.5 && d <= 2.5 + (10 - y) * 0.75) return (x + y) % 3 ? 'c' : 'C';
      return undefined;
    });
    p.ell(8, 8, 2.6, 3.2, 'M');
    p.px(7, 7, 'r');
    p.px(9, 7, 'r');
    p.px(7, 10, 'W');
    p.px(9, 10, 'W');
  }
  return p.outline();
}

export function pod(f: Frame): Grid {
  const p = new Pen(16, 16);
  p.rect(7, 11, 2, 5, 'G');
  p.px(5, 14, 'g');
  p.px(6, 13, 'g');
  p.px(10, 13, 'g');
  p.px(11, 14, 'g');
  p.ell(8, 8, 4.8, f ? 3.8 : 4.6, 'M');
  p.px(6, 7, 'm');
  p.px(9, 6, 'm');
  p.px(10, 9, 'm');
  p.px(5, 9, 'm');
  if (f) {
    p.ell(8, 5, 2.2, 1.2, 'k');
    p.px(7, 2, 'm');
    p.px(9, 1, 'm');
    p.px(8, 3, 'W');
  }
  return p.outline();
}

export function spore(f: Frame): Grid {
  const p = new Pen(16, 16);
  const r = spriteRng(77 + f);
  for (let i = 0; i < 18; i++) {
    const x = r() * 14 + 1;
    const y = r() * 14 + 1;
    p.px(x, y, i % 3 === 0 ? 'W' : i % 2 ? 'm' : 'M');
    if (i % 4 === 0) p.px(x + 1, y, 'm');
  }
  return p;
}

export function phantom(f: Frame): Grid {
  const p = new Pen(16, 24);
  p.ell(8, 16, 4.6, 6, 'L');
  p.rect(6, 11, 1, 10, 'W');
  p.rect(4, 21, 3, 2, 'D');
  p.rect(9, 21, 3, 2, 'D');
  p.ell(8, 7, 4.2, 3.6, 'g');
  p.ell(8, 4.5, 4.4, 2.6, 'W', (_i, j) => j <= 4);
  p.ell(6.5, 7.5, 1, 1.5, 'k');
  p.ell(9.5, 7.5, 1, 1.5, 'k');
  p.line(8, 0, 8, 2, 'L');
  p.px(8, 0, 'y');
  p.rect(2, 13, 2, 4, 'L');
  p.rect(12, 13, 2, 4, 'L');
  p.outline();
  if (f) p.fn((x, y, c) => (c && (x + y) % 2 ? null : undefined));
  return p;
}

export function roller(): Grid {
  const p = new Pen(32, 32);
  const r = spriteRng(5);
  p.ell(16, 16, 14.5, 14.5, 'D');
  p.ell(12.5, 12, 8.5, 7.5, 'L', (i, j) => (i - 16) ** 2 + (j - 16) ** 2 < 180);
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28;
    const d = r() * 9;
    const x = 16 + Math.cos(a) * d;
    const y = 16 + Math.sin(a) * d;
    p.line(x, y, x + 2, y + 1, 'k');
  }
  for (const [x, y] of [
    [9, 20],
    [20, 8],
    [22, 21],
    [13, 11],
  ] as const) {
    p.px(x, y, 'c');
    p.px(x + 1, y, 'C');
    p.px(x, y - 1, 'W');
    p.px(x + 1, y + 1, 'c');
  }
  return p.outline();
}

export function sentry(f: Frame): Grid {
  const p = new Pen(24, 16);
  p.rect(7, 11, 3, 2, 'D');
  p.rect(14, 11, 3, 2, 'D');
  p.rect(7, 13, 3, 2, f ? 'y' : 'r');
  p.rect(14, 13, 3, 2, f ? 'r' : 'y');
  p.px(8, 15, 'y');
  p.px(15, 15, 'y');
  p.ell(12, 7.5, 9.5, 4.5, 'L');
  p.ell(12, 4.5, 4, 3, 'c', (_i, j) => j <= 4);
  p.px(11, 2, 'W');
  p.rect(4, 7, 16, 2, 'D');
  p.rect(f ? 13 : 9, 7, 2, 2, 'r');
  p.px(3, 9, 'W');
  p.px(20, 9, 'W');
  return p.outline();
}

export function drone(f: Frame): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 8, 6.5, 3.2, 'm');
  p.fn((x, y, c) => (c === 'm' && (x + f * 2) % 4 < 2 ? 'M' : undefined));
  p.rect(2, 8, 12, 1, 'y');
  p.rect(7, 2, 2, 4, 'L');
  p.px(7, 1, 'y');
  p.px(8, 1, 'y');
  p.px(7, 11, 'M');
  p.px(8, 11, 'M');
  p.px(8, 12, 'M');
  return p.outline();
}

/** The Cocoa Colossus: Mildred's chocolate-and-candy walker, 48x48. */
export function boss(f: Frame): Grid {
  const p = new Pen(48, 48);
  p.rect(11, 37, 8, 7, 'D');
  p.rect(29, 37, 8, 7, 'D');
  p.rect(8, 44, 13, 3, 'L');
  p.rect(27, 44, 13, 3, 'L');
  p.rect(2, 22, 7, 13, 'D');
  p.rect(39, 22, 7, 13, 'D');
  p.rect(1, 34, 3, 4, 'L');
  p.rect(6, 34, 3, 4, 'L');
  p.rect(39, 34, 3, 4, 'L');
  p.rect(44, 34, 3, 4, 'L');
  p.ell(24, 28, 17, 11.5, 'N');
  p.fn((_x, y, c) => (c === 'N' && y > 34 ? 'R' : undefined));
  for (let x = 12; x <= 36; x += 6) p.rect(x, 22, 1, 12, 'R');
  for (let x = 14; x <= 34; x += 5) p.rect(x, 30, 2, 2, f ? 'r' : 'y');
  p.ell(24, 15, 10, 9.5, 'c', (_i, j) => j <= 18);
  p.rect(14, 18, 21, 2, 'L');
  p.ell(24, 13, 3.6, 3.6, 'W');
  p.rect(18, 10, 2, 4, 'y');
  p.rect(29, 10, 2, 4, 'y');
  p.rect(20, 9, 9, 2, 'y');
  p.px(23, 13, 'k');
  p.px(25, 13, 'k');
  p.px(24, 15, f ? 'R' : 'r');
  p.px(18, 8, 'W');
  p.px(17, 9, 'W');
  return p.outline();
}

// ---------- Projectiles and effects ----------

export function bubble(): Grid {
  const p = new Pen(8, 8);
  p.ell(4, 4, 3.2, 3.2, 'c');
  p.ell(4, 4, 2, 2, 'b');
  p.px(3, 2, 'W');
  p.px(2, 3, 'W');
  return p;
}

export function zshot(): Grid {
  const p = new Pen(8, 8);
  p.ell(4, 4, 3, 3, 'r');
  p.ell(4, 4, 1.6, 1.6, 'y');
  return p;
}

export function glob(): Grid {
  const p = new Pen(8, 8);
  p.ell(4, 4.5, 3, 3, 'N');
  p.px(4, 0, 'N');
  p.px(4, 1, 'N');
  p.px(3, 3, 'y');
  return p.outline();
}

export function stars(f: number): Grid {
  const p = new Pen(16, 8);
  (
    [
      [2, 3],
      [8, 1],
      [13, 4],
    ] as const
  ).forEach(([x, y], i) => {
    const xx = (x + f * 3 + i) % 15;
    p.px(xx, y, 'y');
    p.px(xx - 1, y, 'y');
    p.px(xx + 1, y, 'y');
    p.px(xx, y - 1, 'y');
    p.px(xx, y + 1, 'y');
    p.px(xx, y, 'W');
  });
  return p;
}

export function puff(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 8, 7, 7, 'W', (i, j) => (i + j) % 2 === 0 && (i - 7.5) ** 2 + (j - 7.5) ** 2 > 12);
  p.ell(8, 8, 4, 4, 'L', (i, j) => (i + j) % 3 === 0);
  return p;
}
