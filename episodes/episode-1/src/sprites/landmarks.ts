// Pixel-art landmarks for the overworld: one 32 by 32 picture for each level's node, and the flags that mark them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Colour } from '@lieutenant-fizz/engine/palette';
import { Pen, type Grid } from '@lieutenant-fizz/engine/pen';

/** A crystal: a tall diamond, light on its left half and dark on its right. */
function crystal(p: Pen, cx: number, top: number, h: number, light: Colour, dark: Colour): void {
  const mid = top + h * 0.4;
  p.fn((x, y) => {
    if (y < top || y > top + h) return undefined;
    const half =
      y < mid ? ((y - top) / (mid - top)) * 2.4 : ((top + h - y) / (top + h - mid)) * 2.4;
    const d = x + 0.5 - cx;
    if (Math.abs(d) > half) return undefined;
    return d < 0 ? light : dark;
  });
}

/** Crater Fields: a glowing crater ringed with crystals. */
export function lmCrater(): Grid {
  const p = new Pen(32, 32);
  p.ell(16, 24, 15, 7, 'N');
  p.ell(16, 24, 12, 5, 'D');
  p.ell(16, 24, 9, 3.4, 'k');
  p.ell(16, 24, 5, 2, 'R');
  p.ell(16, 24, 2.5, 1, 'y');
  crystal(p, 5, 9, 14, 'c', 'C');
  crystal(p, 27, 11, 12, 'm', 'M');
  crystal(p, 10, 14, 10, 'W', 'c');
  crystal(p, 23, 15, 9, 'c', 'C');
  return p.outline();
}

/** Crystal Caves: a rocky hill with a dark mouth and crystals growing from its top. */
export function lmCaves(): Grid {
  const p = new Pen(32, 32);
  p.ell(16, 30, 15, 14, 'D', (_, j) => j <= 30);
  p.ell(14, 27, 10, 9, 'L', (_, j) => j <= 30);
  p.ell(16, 31, 6, 8, 'k', (_, j) => j <= 31);
  p.ell(16, 31, 4, 6, 'B', (_, j) => j <= 31);
  crystal(p, 9, 5, 13, 'c', 'C');
  crystal(p, 21, 2, 15, 'm', 'M');
  crystal(p, 26, 9, 10, 'c', 'C');
  return p.outline();
}

/** Meteor Mesa: a flat-topped mesa in bands of red rock, with a small meteor crater on top. */
export function lmMesa(): Grid {
  const p = new Pen(32, 32);
  for (let y = 10; y < 31; y++) {
    const w = 8 + (y - 10) * 0.55;
    const band = Math.floor((y - 10) / 4) % 3;
    p.rect(Math.round(16 - w), y, Math.round(w * 2), 1, band === 0 ? 'R' : band === 1 ? 'N' : 'r');
  }
  p.rect(7, 9, 18, 2, 'N');
  p.ell(18, 9, 4, 1.4, 'k');
  p.ell(18, 9, 2, 0.8, 'y');
  p.rect(10, 12, 2, 5, 'D');
  p.rect(21, 18, 2, 5, 'D');
  return p.outline();
}

/** Zarg Lookout: a watchtower with a platform, a roof and an aerial. */
export function lmLookout(): Grid {
  const p = new Pen(32, 32);
  p.rect(12, 9, 8, 22, 'L');
  p.rect(12, 9, 3, 22, 'W');
  for (let y = 13; y < 30; y += 6) p.rect(15, y, 2, 3, 'k');
  p.rect(8, 6, 16, 3, 'D');
  p.rect(9, 9, 14, 1, 'N');
  p.rect(10, 3, 12, 3, 'R');
  p.rect(13, 1, 6, 2, 'r');
  p.line(16, 1, 16, 0, 'W');
  p.rect(10, 30, 12, 2, 'N');
  return p.outline();
}

/** Marshmallow Meadows: a stack of giant marshmallows with a cherry on top. */
export function lmMeadows(): Grid {
  const p = new Pen(32, 32);
  p.ell(16, 25, 13, 6, 'W');
  p.ell(16, 25, 13, 6, 'W');
  p.ell(14, 26, 8, 3, 'L');
  p.ell(16, 17, 9.5, 5.5, 'W');
  p.ell(14, 18, 5, 2.5, 'L');
  p.ell(16, 10, 6, 4, 'm');
  p.ell(15, 9, 3, 1.6, 'W');
  p.ell(16, 5, 2.4, 2.4, 'R');
  p.px(15, 4, 'W');
  p.px(17, 2, 'g');
  p.px(18, 1, 'g');
  return p.outline();
}

/** Fudge Bog: a murky fudge pool with a dead tree and bubbles. */
export function lmFudgeBog(): Grid {
  const p = new Pen(32, 32);
  p.ell(16, 26, 15, 6, 'N');
  p.ell(16, 26, 12, 4, 'k');
  p.ell(14, 26, 6, 2, 'R');
  p.px(8, 24, 'y');
  p.px(21, 27, 'y');
  p.px(12, 28, 'N');
  p.rect(23, 8, 2, 18, 'N');
  p.line(24, 12, 29, 7, 'N');
  p.line(24, 15, 19, 10, 'N');
  p.line(24, 18, 28, 14, 'N');
  p.px(29, 7, 'D');
  p.px(19, 10, 'D');
  p.rect(5, 22, 2, 4, 'g');
  p.rect(8, 21, 2, 5, 'g');
  return p.outline();
}

/** Bonbon Playhouse: a little theatre with a pediment, red curtains and a marquee. */
export function lmPlayhouse(): Grid {
  const p = new Pen(32, 32);
  p.rect(4, 13, 24, 18, 'M');
  p.rect(4, 13, 24, 2, 'm');
  p.fn((x, y) => (y >= 5 && y < 13 && Math.abs(x + 0.5 - 16) <= (y - 4) * 1.6 ? 'W' : undefined));
  p.px(16, 9, 'R');
  p.rect(8, 17, 16, 4, 'y');
  for (let x = 9; x < 23; x += 3) p.px(x, 19, 'k');
  p.rect(9, 23, 6, 8, 'R');
  p.rect(17, 23, 6, 8, 'R');
  p.rect(15, 23, 2, 8, 'k');
  return p.outline();
}

/** Mirror Shafts: a tall standing mirror, a cut diamond of glass with streaks of light. */
export function lmShafts(): Grid {
  const p = new Pen(32, 32);
  p.fn((x, y) => {
    if (y < 1 || y > 29) return undefined;
    const half = y < 14 ? (y - 1) * 0.95 : (29 - y) * 0.8;
    const d = x + 0.5 - 16;
    if (Math.abs(d) > half) return undefined;
    return d < -half / 3 ? 'W' : d < half / 3 ? 'c' : 'b';
  });
  p.line(11, 13, 15, 8, 'W');
  p.line(15, 20, 19, 14, 'W');
  p.rect(14, 29, 4, 2, 'D');
  p.rect(10, 31, 12, 1, 'N');
  return p.outline();
}

/** Sugar Glass Gallery: a glass pavilion, an arched frame of pale blue panes with glints. */
export function lmSugarGlass(): Grid {
  const p = new Pen(32, 32);
  p.rect(4, 14, 24, 17, 'c');
  p.ell(16, 14, 12, 9, 'c', (_, j) => j <= 14);
  p.rect(4, 14, 24, 1, 'b');
  for (let x = 4; x < 28; x += 6) p.rect(x, 8, 1, 23, 'b');
  p.rect(4, 22, 24, 1, 'b');
  p.rect(4, 30, 24, 1, 'b');
  p.rect(13, 22, 6, 9, 'B');
  p.px(7, 11, 'W');
  p.px(8, 12, 'W');
  p.px(21, 18, 'W');
  p.px(22, 19, 'W');
  p.px(10, 25, 'W');
  return p.outline();
}

/** Frosting Flats: a wide iced slab cake with candles. */
export function lmFlats(): Grid {
  const p = new Pen(32, 32);
  p.rect(2, 20, 28, 10, 'N');
  p.rect(2, 20, 28, 2, 'W');
  p.rect(2, 25, 28, 1, 'R');
  p.rect(1, 17, 30, 4, 'W');
  p.fn((x, y) => (y === 21 && x % 4 === 1 && x > 3 && x < 29 ? 'W' : undefined));
  for (const x of [8, 15, 22]) {
    p.rect(x, 11, 2, 6, 'm');
    p.px(x, 9, 'y');
    p.px(x + 1, 10, 'r');
  }
  return p.outline();
}

/** Frosting Spire: a tall piped spire of pink and white frosting. */
export function lmSpire(): Grid {
  const p = new Pen(32, 32);
  p.fn((x, y) => {
    if (y < 1 || y > 30) return undefined;
    const half = 1 + (y - 1) * 0.42;
    const d = x + 0.5 - 16;
    if (Math.abs(d) > half) return undefined;
    return y % 5 === 0 ? 'W' : d < 0 ? 'm' : 'M';
  });
  p.px(15, 0, 'y');
  p.px(16, 0, 'y');
  p.px(12, 11, 'c');
  p.px(19, 17, 'y');
  p.px(10, 23, 'c');
  p.px(21, 26, 'c');
  return p.outline();
}

/** Cocoa Foundry: a brick works with two smokestacks and a glowing furnace door. */
export function lmFoundry(): Grid {
  const p = new Pen(32, 32);
  p.rect(3, 14, 26, 17, 'D');
  p.fn((x, y) =>
    y >= 14 && y < 31 && x >= 3 && x < 29 && (y + (x >> 1)) % 4 === 0 ? 'L' : undefined,
  );
  p.rect(6, 5, 4, 10, 'N');
  p.rect(20, 3, 4, 12, 'N');
  p.rect(6, 5, 4, 1, 'R');
  p.rect(20, 3, 4, 1, 'R');
  p.ell(8, 3, 3, 2, 'L');
  p.ell(11, 1, 2, 1.6, 'L');
  p.ell(22, 1, 3, 1.6, 'D');
  p.rect(12, 21, 8, 10, 'k');
  p.rect(13, 23, 6, 8, 'R');
  p.rect(14, 26, 4, 5, 'y');
  return p.outline();
}

/** Gumdrop Isle: a heap of gumdrops in every colour. */
export function lmGumdrop(): Grid {
  const p = new Pen(32, 32);
  const drop = (cx: number, cy: number, r: number, c: Colour, hi: Colour): void => {
    p.ell(cx, cy, r, r * 0.85, c, (_, j) => j <= cy + r * 0.85);
    p.rect(Math.round(cx - r), Math.round(cy + r * 0.85) - 1, Math.round(r * 2), 2, c);
    p.px(cx - r * 0.35, cy - r * 0.45, hi);
    p.px(cx - r * 0.1, cy - r * 0.6, hi);
  };
  drop(9, 25, 7, 'r', 'W');
  drop(23, 25, 7, 'g', 'W');
  drop(16, 26, 6, 'y', 'W');
  drop(12, 16, 6, 'b', 'W');
  drop(21, 15, 6, 'm', 'W');
  drop(16, 8, 5.5, 'c', 'W');
  return p.outline();
}

/** Whisper Hollow: a huge hollow stump with a glowing hole, roots and toadstools. */
export function lmHollow(): Grid {
  const p = new Pen(32, 32);
  p.rect(8, 8, 16, 22, 'N');
  p.ell(16, 8, 8, 3, 'N');
  p.ell(16, 8, 5.5, 1.8, 'D');
  p.rect(9, 8, 3, 22, 'R');
  p.line(8, 29, 2, 31, 'N');
  p.line(24, 29, 30, 31, 'N');
  p.ell(16, 21, 4, 5.5, 'k');
  p.ell(16, 22, 2.4, 3.4, 'B');
  p.px(15, 21, 'W');
  p.px(17, 21, 'W');
  p.ell(5, 28, 3, 2, 'r', (_, j) => j <= 28);
  p.px(4, 27, 'W');
  p.rect(5, 28, 1, 3, 'W');
  p.ell(27, 27, 3, 2, 'r', (_, j) => j <= 27);
  p.px(28, 26, 'W');
  p.rect(27, 27, 1, 4, 'W');
  return p.outline();
}

// ---------- Flags ----------

/** A pennant on a pole flying yellow: the level is open. Two frames wave it. */
export function flagOpen(f: number): Grid {
  const p = new Pen(16, 16);
  p.rect(4, 2, 1, 13, 'N');
  const dy = f ? 1 : 0;
  for (let x = 0; x < 8; x++)
    p.rect(5 + x, 2 + dy * (x > 3 ? 1 : 0), 1, 4 - Math.floor(x / 2), 'y');
  p.rect(5, 2, 8, 1, 'r');
  return p.outline();
}

/** A grey pennant with a padlock: the level is locked until the ones before it are cleared. */
export function flagLocked(): Grid {
  const p = new Pen(16, 16);
  p.rect(4, 2, 1, 13, 'D');
  for (let x = 0; x < 8; x++) p.rect(5 + x, 2, 1, 4 - Math.floor(x / 2), 'L');
  p.rect(7, 9, 6, 5, 'D');
  p.rect(8, 6, 4, 3, null);
  p.rect(8, 6, 1, 3, 'L');
  p.rect(11, 6, 1, 3, 'L');
  p.rect(8, 6, 4, 1, 'L');
  p.px(9, 11, 'k');
  p.px(10, 11, 'k');
  return p.outline();
}
