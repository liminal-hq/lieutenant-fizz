// Pixel-art overworld tiles plus ship, sky and cinematic props for Episode 1.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, spriteRng, type Grid } from '@lieutenant-fizz/engine/pen';

// ---------- Overworld ----------

export function owGrass(seed: number): Grid {
  const r = spriteRng(seed);
  return new Pen(16, 16).fn(() => {
    const q = r();
    return q < 0.08 ? 'g' : q < 0.1 ? 'c' : 'G';
  });
}

export function owPath(seed: number): Grid {
  const r = spriteRng(seed);
  return new Pen(16, 16).fn(() => {
    const q = r();
    return q < 0.1 ? 'N' : q < 0.13 ? 'W' : 'y';
  });
}

export function owRiver(f: number): Grid {
  return new Pen(16, 16).fn((x, y) =>
    Math.sin(x * 0.6 + y * 0.9 + f * 2.5) > 0.85 ? 'y' : (x + y * 2 + f) % 7 === 0 ? 'R' : 'N',
  );
}

export function owTree(v: number): Grid {
  const p = new Pen(16, 16);
  p.rect(7, 11, 2, 4, 'N');
  const c1 = v ? 'm' : 'c';
  const c2 = v ? 'M' : 'C';
  p.fn((x, y) => {
    if (y > 11 || y < 1) return undefined;
    const w = Math.min(y - 0.5, 12 - y) * 0.75;
    const d = x + 0.5 - 8;
    if (Math.abs(d) <= w) return d < -w / 3 ? 'W' : d < w / 3 ? c1 : c2;
    return undefined;
  });
  return p.outline();
}

export function owRock(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 10, 6, 4.5, 'D');
  p.ell(7, 9, 4, 3, 'L');
  p.px(5, 8, 'W');
  return p.outline();
}

export function owCrater(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 9, 7, 5, 'M');
  p.ell(8, 9, 5, 3.4, 'k');
  p.ell(8, 10, 3.5, 2, 'B');
  p.px(4, 6, 'm');
  p.px(11, 6, 'm');
  return p.outline();
}

export function owMesa(): Grid {
  const p = new Pen(16, 16);
  p.rect(3, 6, 10, 9, 'N');
  p.rect(2, 5, 12, 2, 'y');
  p.rect(5, 8, 2, 5, 'R');
  p.rect(10, 9, 2, 4, 'R');
  p.ell(12, 3, 3.2, 1.8, 'W');
  p.ell(4, 2.5, 2.4, 1.4, 'W');
  return p.outline();
}

export function owTower(): Grid {
  const p = new Pen(16, 16);
  p.rect(4, 3, 8, 12, 'D');
  p.rect(3, 1, 10, 3, 'L');
  p.rect(3, 1, 2, 1, 'k');
  p.rect(7, 1, 2, 1, 'k');
  p.rect(11, 1, 2, 1, 'k');
  for (const y of [6, 9, 12] as const) {
    p.rect(6, y, 2, 2, 'y');
    p.rect(9, y, 2, 2, 'c');
  }
  p.rect(7, 13, 2, 2, 'N');
  return p.outline();
}

export function owPlayhouse(): Grid {
  const p = new Pen(16, 16);
  p.rect(2, 6, 12, 9, 'R');
  p.rect(1, 4, 14, 3, 'y');
  p.rect(3, 7, 4, 7, 'k');
  p.rect(9, 7, 4, 7, 'k');
  p.rect(7, 7, 2, 7, 'M');
  p.px(8, 2, 'W');
  p.rect(7, 3, 2, 1, 'W');
  return p.outline();
}

export function owMeadow(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 14, 7.5, 6, 'g', (_i, j) => j < 15);
  p.ell(5, 9, 2.4, 2, 'W');
  p.ell(11, 10, 2.2, 1.8, 'm');
  p.ell(8, 7, 2, 1.6, 'W');
  p.px(8, 6, 'm');
  return p.outline();
}

export function owShaft(): Grid {
  const p = new Pen(16, 16);
  for (const [x, top, w] of [
    [2, 8, 4],
    [6, 1, 5],
    [11, 6, 3],
  ] as const) {
    for (let y = top; y < 15; y++) {
      for (let i = 0; i < w; i++) p.px(x + i, y, i === 0 ? 'W' : i === w - 1 ? 'C' : 'c');
    }
  }
  p.rect(1, 14, 14, 1, 'D');
  return p.outline();
}

/** A painted map of the crystal forest: rivers, grass and a ring of trees in the south-east. */
export function mural(): Grid {
  const p = new Pen(48, 32);
  p.rect(0, 0, 48, 32, 'N');
  p.rect(2, 2, 44, 28, 'G');
  p.rect(2, 12, 44, 3, 'b');
  p.rect(22, 2, 3, 28, 'b');
  for (let i = 0; i < 40; i++) p.px(4 + ((i * 7) % 40), 4 + ((i * 5) % 24), 'g');
  // A ring of five trees with a gap on its west side, matching the clearing on the map. They are
  // spaced so none overlaps another, and drawn in magenta so they stand out from the grass.
  const ring = [
    [36, 20],
    [42, 20],
    [43, 25],
    [42, 29],
    [36, 29],
  ] as const;
  for (const [x, y] of ring) {
    p.px(x, y - 4, 'y');
    p.rect(x - 1, y - 3, 3, 1, 'm');
    p.rect(x - 2, y - 2, 5, 1, 'm');
    p.rect(x - 2, y - 1, 5, 1, 'M');
    p.rect(x, y, 1, 1, 'N');
  }
  return p.outline();
}

export function owCave(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 11, 7.5, 8, 'D', (_i, j) => j < 16);
  p.ell(8, 12, 4.5, 6, 'k', (_i, j) => j < 16);
  p.px(3, 8, 'c');
  p.px(12, 7, 'c');
  p.px(4, 7, 'W');
  p.px(2, 10, 'L');
  return p.outline();
}

export function owCastle(): Grid {
  const p = new Pen(32, 32);
  p.rect(4, 12, 24, 19, 'N');
  p.rect(2, 6, 7, 25, 'N');
  p.rect(23, 6, 7, 25, 'N');
  p.rect(12, 2, 8, 12, 'N');
  for (const [x, y, w] of [
    [2, 6, 7],
    [23, 6, 7],
    [12, 2, 8],
    [4, 12, 24],
  ] as const) {
    p.rect(x, y, w, 2, 'W');
    for (let i = x; i < x + w; i += 3) p.px(i, y + 2, 'W');
  }
  p.rect(13, 22, 6, 9, 'k');
  p.ell(16, 22, 3, 3, 'k');
  p.rect(5, 1, 1, 5, 'L');
  p.rect(6, 1, 3, 2, 'm');
  p.rect(26, 1, 1, 5, 'L');
  p.rect(27, 1, 3, 2, 'm');
  for (let y = 16; y < 30; y += 4) p.rect(4, y, 24, 1, 'm');
  p.rect(5, 10, 2, 3, 'y');
  p.rect(25, 10, 2, 3, 'y');
  p.rect(15, 6, 2, 3, 'y');
  return p.outline();
}

export function owTele(f: number): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 10, 7, 4, 'D');
  p.ell(8, 10, 5.5, 3, f ? 'c' : 'b');
  p.ell(8, 10, 3.5, 1.8, f ? 'W' : 'c');
  if (f) {
    p.px(5, 4, 'c');
    p.px(10, 2, 'W');
    p.px(8, 6, 'c');
  }
  return p.outline();
}

export function owFlag(): Grid {
  const p = new Pen(16, 16);
  p.rect(5, 2, 1, 13, 'L');
  p.rect(6, 2, 7, 5, 'g');
  p.rect(6, 6, 7, 1, 'G');
  p.px(8, 4, 'W');
  return p.outline();
}

// ---------- Ship, sky and cinematic props ----------

/** The spaghetti-with-meatballs flying saucer. */
export function saucer(): Grid {
  const p = new Pen(32, 16);
  p.ell(16, 5, 6.5, 4.5, 'c', (_i, j) => j <= 6);
  p.px(13, 2, 'W');
  p.px(14, 1, 'W');
  p.ell(16, 11, 15.5, 4, 'W');
  p.rect(2, 13, 28, 1, 'L');
  p.fn((x, y, c) =>
    c === 'W' && y >= 8 && y <= 11 && Math.sin(x * 1.3 + y * 2) > 0.2 ? 'y' : undefined,
  );
  p.ell(16, 8.5, 9, 2.4, 'r');
  for (const [x, y] of [
    [10, 8],
    [16, 7],
    [22, 8],
  ] as const) {
    p.ell(x, y, 2.4, 2.2, 'N');
    p.px(x - 1, y - 1, 'y');
  }
  for (let x = 5; x < 28; x += 4) p.px(x, 12, 'y');
  return p.outline();
}

export function planet(): Grid {
  const p = new Pen(32, 32);
  p.ell(16, 16, 15.5, 15.5, 'G');
  p.fn((x, y, c) => {
    if (!c) return undefined;
    const v = Math.sin(y * 0.55 + Math.sin(x * 0.3) * 1.6);
    return v > 0.6 ? 'M' : v > 0.2 ? 'g' : v < -0.75 ? 'm' : undefined;
  });
  p.ell(11, 10, 3, 2, 'W', (i, j) => (i + j) % 2 === 0);
  return p;
}

export const hillTop = (): Grid =>
  new Pen(16, 16).fn((x, y) =>
    y >= 7 + Math.round(2 * Math.sin((x / 16) * Math.PI * 2)) ? 'W' : null,
  );

export const mtnTop = (): Grid =>
  new Pen(16, 16).fn((x, y) => (y >= Math.abs(x - 7.5) * 1.8 + 2 ? 'W' : null));

/** A flat-bottomed puffy cloud, white so layers can tint it. */
export function cloud(): Grid {
  const p = new Pen(48, 16);
  for (const [x, y, rx, ry] of [
    [12, 9, 9, 5],
    [24, 7, 11, 6],
    [36, 9, 9, 5],
  ] as const) {
    p.ell(x, y, rx, ry, 'W');
  }
  return p.fn((x, y, c) => (c && y > 11 ? null : undefined));
}

export const star = (): Grid =>
  new Pen(4, 4).fn((x, y) => ((x === 1 || x === 2) && (y === 1 || y === 2) ? 'W' : null));

export const fillSolid = (): Grid => new Pen(16, 16).fn(() => 'W');

export function bigTree(): Grid {
  const p = new Pen(64, 80);
  const r = spriteRng(31);
  for (const [x, y, rx, ry] of [
    [32, 22, 30, 18],
    [12, 32, 12, 9],
    [52, 32, 12, 9],
    [32, 9, 20, 9],
  ] as const) {
    p.ell(x, y, rx, ry, 'G');
  }
  p.fn((_x, _y, c) => (c === 'G' ? (r() < 0.16 ? 'g' : r() < 0.05 ? 'k' : undefined) : undefined));
  p.fn((x, y, c) => (c === 'G' && y < 16 && x < 36 && (x + y) % 3 === 0 ? 'g' : undefined));
  p.rect(27, 40, 10, 36, 'N');
  p.rect(22, 72, 20, 6, 'N');
  p.rect(17, 76, 30, 4, 'N');
  for (let y = 44; y < 72; y += 5) {
    p.px(29 + (y % 3), y, 'k');
    p.px(34, y + 2, 'k');
    p.px(34, y + 3, 'k');
  }
  p.rect(6, 40, 52, 3, 'N');
  p.rect(6, 40, 52, 1, 'y');
  p.line(11, 49, 19, 43, 'N');
  p.line(53, 49, 45, 43, 'N');
  p.rect(12, 24, 40, 16, 'N');
  for (let x = 14; x < 52; x += 4) p.rect(x, 24, 1, 16, 'R');
  for (let j = 0; j < 12; j++) {
    const hw = Math.round(3 + j * 2.1);
    p.rect(32 - hw, 12 + j, hw * 2, 1, j % 3 === 2 ? 'R' : 'r');
  }
  p.rect(18, 28, 10, 8, 'y');
  p.rect(22, 28, 1, 8, 'N');
  p.rect(18, 31, 10, 1, 'N');
  p.rect(19, 29, 2, 1, 'W');
  p.rect(36, 28, 8, 12, 'k');
  p.px(42, 34, 'y');
  for (let y = 43; y < 76; y++) {
    p.px(47, y, 'L');
    p.px(51, y, 'L');
  }
  for (let y = 46; y < 76; y += 4) p.rect(47, y, 5, 1, 'y');
  p.rect(27, 72, 10, 1, 'L');
  p.rect(28, 73, 8, 4, 'k');
  p.rect(29, 74, 6, 3, 'y');
  p.rect(30, 74, 4, 1, 'W');
  return p.outline();
}

export function house(): Grid {
  const p = new Pen(48, 40);
  p.rect(34, 1, 4, 9, 'D');
  for (let j = 0; j < 14; j++) {
    const hw = Math.round(4 + j * 1.55);
    p.rect(24 - hw, 2 + j, hw * 2, 1, 'D');
  }
  p.rect(4, 16, 40, 24, 'L');
  for (let y = 19; y < 40; y += 4) p.rect(4, y, 40, 1, 'W');
  p.rect(9, 21, 9, 8, 'y');
  p.rect(13, 21, 1, 8, 'N');
  p.rect(9, 24, 9, 1, 'N');
  p.rect(30, 21, 9, 8, 'B');
  p.rect(34, 21, 1, 8, 'k');
  p.rect(30, 24, 9, 1, 'k');
  p.rect(21, 27, 7, 13, 'N');
  p.px(26, 33, 'y');
  return p.outline();
}

export function fence(): Grid {
  const p = new Pen(16, 16);
  p.rect(0, 8, 16, 1, 'D');
  p.rect(0, 12, 16, 1, 'D');
  for (const x of [2, 10]) {
    p.rect(x, 5, 3, 11, 'L');
    p.px(x + 1, 4, 'L');
    p.px(x, 5, 'W');
  }
  return p;
}

export function moon(): Grid {
  const p = new Pen(16, 16);
  p.ell(8, 8, 6.5, 6.5, 'W');
  p.ell(6, 6, 1.6, 1.4, 'L');
  p.ell(10, 10, 2, 1.6, 'L');
  p.px(10, 5, 'L');
  return p;
}

export const labPanel = (): Grid =>
  new Pen(16, 16).fn((x, y) =>
    x === 0 || y === 0
      ? 'k'
      : (x === 2 || x === 13) && (y === 2 || y === 13)
        ? 'L'
        : y === 1
          ? 'L'
          : 'D',
  );

export function labConsole(f: number): Grid {
  const p = new Pen(32, 32);
  p.rect(1, 4, 30, 28, 'D');
  p.rect(1, 4, 30, 1, 'L');
  p.rect(4, 7, 14, 10, 'k');
  for (let x = 5; x < 17; x++) p.px(x, 12 + Math.round(2 * Math.sin((x + f * 3) * 0.8)), 'g');
  p.ell(24, 11, 3.5, 3.5, 'L');
  p.ell(24, 11, 1.5, 1.5, 'k');
  p.px(24, 9, f ? 'r' : 'y');
  const lamps = ['r', 'y', 'g'] as const;
  for (let i = 0; i < 6; i++) p.rect(5 + i * 4, 20, 2, 2, lamps[(i + f) % 3] ?? 'r');
  for (let y = 25; y < 30; y += 2) for (let x = 5; x < 28; x += 3) p.px(x, y, 'L');
  return p.outline();
}

export function blueprint(): Grid {
  const p = new Pen(32, 24);
  p.fn((x, y) =>
    x === 0 || y === 0 || x === 31 || y === 23 ? 'c' : x % 4 === 0 || y % 4 === 0 ? 'b' : 'B',
  );
  p.line(5, 15, 27, 15, 'W');
  p.line(5, 15, 9, 12, 'W');
  p.line(27, 15, 23, 12, 'W');
  p.line(9, 12, 23, 12, 'W');
  p.line(12, 12, 14, 8, 'W');
  p.line(14, 8, 18, 8, 'W');
  p.line(18, 8, 20, 12, 'W');
  for (const [x, y] of [
    [11, 14],
    [16, 14],
    [21, 14],
  ] as const) {
    p.px(x, y, 'r');
  }
  p.rect(4, 19, 10, 1, 'c');
  p.rect(4, 21, 6, 1, 'c');
  p.px(1, 1, 'r');
  p.px(30, 1, 'r');
  return p;
}

export function bench(): Grid {
  const p = new Pen(32, 16);
  p.rect(0, 6, 32, 2, 'N');
  p.rect(0, 6, 32, 1, 'y');
  p.rect(2, 8, 2, 8, 'D');
  p.rect(28, 8, 2, 8, 'D');
  p.rect(2, 12, 28, 1, 'D');
  p.rect(8, 2, 9, 4, 'W');
  for (const [x, y] of [
    [9, 3],
    [10, 3],
    [11, 3],
    [9, 5],
    [10, 5],
  ] as const) {
    p.px(x, y, 'D');
  }
  for (const [x, y] of [
    [13, 3],
    [15, 3],
    [14, 4],
    [13, 5],
    [15, 5],
  ] as const) {
    p.px(x, y, 'r');
  }
  p.rect(22, 1, 3, 5, 'r');
  p.px(22, 3, 'W');
  p.rect(22, 1, 3, 1, 'L');
  return p.outline();
}

export function launchPad(): Grid {
  const p = new Pen(48, 8);
  p.rect(0, 2, 48, 6, 'D');
  p.rect(0, 2, 48, 1, 'L');
  p.fn((x, y) => (y === 4 || y === 5 ? ((x + y) % 6 < 3 ? 'y' : 'k') : undefined));
  for (let x = 4; x < 48; x += 8) p.px(x, 2, 'c');
  return p.outline();
}

export function ladder(): Grid {
  const p = new Pen(16, 16);
  p.rect(3, 0, 2, 16, 'L');
  p.rect(11, 0, 2, 16, 'L');
  p.rect(5, 7, 6, 1, 'L');
  p.rect(5, 8, 6, 1, 'D');
  p.rect(5, 15, 6, 1, 'L');
  return p;
}

/** A ladder whose top rung is a standable ledge: Ben can stand on it and climb down. */
export function ladderTop(): Grid {
  const p = new Pen(16, 16);
  p.rect(3, 3, 2, 13, 'L');
  p.rect(11, 3, 2, 13, 'L');
  p.rect(5, 10, 6, 1, 'L');
  p.rect(5, 11, 6, 1, 'D');
  p.rect(0, 0, 16, 2, 'y');
  p.rect(0, 2, 16, 1, 'N');
  return p;
}

/** A three-tile lift tray: striped deck, guide rails, a lamp under each end. */
export function liftTray(f: 0 | 1): Grid {
  const p = new Pen(48, 8);
  p.rect(0, 1, 48, 4, 'D');
  p.rect(0, 0, 48, 1, 'y');
  for (let x = 2; x < 46; x += 6) p.rect(x, 1, 3, 4, 'N');
  p.rect(0, 5, 48, 1, 'k');
  for (const x of [3, 43] as const) {
    p.rect(x, 6, 2, 2, f ? 'y' : 'r');
  }
  return p;
}

export function lamp(): Grid {
  const p = new Pen(16, 16);
  p.rect(7, 0, 2, 7, 'D');
  for (let j = 0; j < 4; j++) p.rect(6 - j, 7 + j, 4 + j * 2, 1, 'L');
  p.ell(8, 12.5, 2, 1.6, 'y');
  return p.outline();
}
