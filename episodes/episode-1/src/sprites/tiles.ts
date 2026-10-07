// Tile-set-coloured pixel-art level tiles for the crater, caves, citadel and open sky.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Pen, spriteRng, type Grid } from '@lieutenant-fizz/engine/pen';
import type { Colour } from '@lieutenant-fizz/engine/palette';

export type Biome = 'crater' | 'caves' | 'citadel' | 'sky' | 'building' | 'theatre' | 'foundry';

interface BiomeColours {
  top: Colour;
  top2: Colour;
  fill: Colour;
  fill2: Colour;
  fleck: Colour;
  plat: [Colour, Colour, Colour];
  block: [Colour, Colour, Colour];
}

export const BIOMES: Record<Biome, BiomeColours> = {
  crater: {
    top: 'g',
    top2: 'G',
    fill: 'M',
    fill2: 'B',
    fleck: 'm',
    plat: ['c', 'C', 'b'],
    block: ['m', 'M', 'W'],
  },
  caves: {
    top: 'c',
    top2: 'C',
    fill: 'D',
    fill2: 'k',
    fleck: 'L',
    plat: ['L', 'D', 'k'],
    block: ['L', 'D', 'W'],
  },
  citadel: {
    top: 'W',
    top2: 'm',
    fill: 'N',
    fill2: 'R',
    fleck: 'y',
    plat: ['y', 'N', 'R'],
    block: ['N', 'R', 'y'],
  },
  // A Zarg tower: carpeted floors, concrete slabs, stepped stairs, panelled walls.
  building: {
    top: 'r',
    top2: 'r',
    fill: 'D',
    fill2: 'D',
    fleck: 'L',
    plat: ['y', 'N', 'R'],
    block: ['L', 'D', 'W'],
  },
  // The cocoa foundry: steel plate, iron, rust and rivets.
  foundry: {
    top: 'L',
    top2: 'D',
    fill: 'D',
    fill2: 'k',
    fleck: 'N',
    plat: ['y', 'D', 'k'],
    block: ['L', 'D', 'y'],
  },
  // A candy playhouse: a wooden stage, red velvet and gold trim.
  theatre: {
    top: 'N',
    top2: 'N',
    fill: 'R',
    fill2: 'k',
    fleck: 'y',
    plat: ['y', 'N', 'R'],
    block: ['R', 'k', 'y'],
  },
  // Sun-baked biscuit rock with cloud ledges, for the daylight mesa levels.
  sky: {
    top: 'y',
    top2: 'N',
    fill: 'N',
    fill2: 'N',
    fleck: 'y',
    plat: ['W', 'L', 'c'],
    block: ['y', 'N', 'R'],
  },
};

/** Terrain tile: everything under `surf(x)` (height in pixels above the tile bottom) is ground. */
export function ground(bio: Biome, surf: (x: number) => number, seed: number): Grid {
  const B = BIOMES[bio];
  const r = spriteRng(seed);
  return new Pen(16, 16).fn((x, y) => {
    const hb = 16 - y - 0.5;
    // Slopes in a building are stairs: step the surface every four pixels.
    const raw = surf(x + 0.5);
    const s = bio === 'building' && Number.isFinite(raw) ? Math.round(raw / 4) * 4 : raw;
    if (hb > s) return null;
    const d = s - hb;
    const q = r();
    if (d < 1.2) return B.top;
    if (d < 2.5) return q < 0.3 ? B.top : B.top2;
    if (d < 3.6) return q < 0.5 ? B.top2 : B.fill;
    if (bio === 'citadel') {
      const l = y % 8;
      return l === 5 ? 'm' : l === 6 && q < 0.5 ? 'W' : q < 0.06 ? 'y' : 'N';
    }
    return q < 0.07 ? B.fleck : q < 0.2 ? B.fill2 : B.fill;
  });
}

export const fillTile = (bio: Biome, seed: number): Grid => ground(bio, () => Infinity, seed);

export function platTile(bio: Biome): Grid {
  if (bio === 'sky') return cloudLedge();
  const [a, b, c] = BIOMES[bio].plat;
  return new Pen(16, 16).fn((x, y) =>
    y === 0
      ? a
      : y < 4
        ? (x + y) % 5 === 0
          ? c
          : b
        : y === 4
          ? c
          : y === 5 && x % 5 === 2
            ? b
            : null,
  );
}

/** A conveyor belt: a steel track with chevrons that shift between frames. */
export function conveyorTile(dir: 'L' | 'R', f: 0 | 1): Grid {
  return new Pen(16, 16).fn((x, y) => {
    if (y === 0) return 'L';
    if (y === 15) return 'k';
    if (y > 5) return 'D';
    // A chevron every eight pixels that steps four pixels each frame, towards the belt's direction.
    const step = dir === 'R' ? f * 4 : 16 - f * 4;
    const d = (x + step) % 8;
    const arrow = dir === 'R' ? d === y || d === 8 - y : d === 5 - y || d === 3 + y;
    return arrow ? 'y' : 'N';
  });
}

/** A crushing press: a steel block with a hazard-striped face and a piston above it. */
export function pressTile(down: boolean): Grid {
  const p = new Pen(32, 24);
  p.rect(14, 0, 4, 6, 'L');
  p.rect(2, 6, 28, 14, 'D');
  p.rect(2, 6, 28, 2, 'L');
  for (let x = 2; x < 30; x += 4) p.rect(x, 18, 2, 2, 'y');
  p.rect(2, 20, 28, 4, down ? 'r' : 'N');
  for (let x = 2; x < 30; x += 6) p.rect(x, 20, 3, 4, 'k');
  p.px(4, 9, 'k');
  p.px(27, 9, 'k');
  return p.outline();
}

/** Molten metal. */
export function furnaceTop(f: number): Grid {
  return new Pen(16, 16).fn((x, y) => {
    const s = 3 + Math.round(Math.sin(((x + f * 5) / 16) * Math.PI * 2) * 1.2);
    if (y < s) return null;
    if (y === s) return (x + f * 3) % 6 === 0 ? 'W' : 'y';
    return y < s + 3 ? 'r' : (x + y + f) % 7 === 0 ? 'y' : 'R';
  });
}

export function furnaceDeep(f: number): Grid {
  return new Pen(16, 16).fn((x, y) =>
    Math.sin((x * 0.8 + y * 0.5 + f * 3) * 0.9) > 0.6 ? 'r' : 'R',
  );
}

/** A 45-degree glass mirror in a frame; the `/` orientation, flipped in the sim for `\\`. */
export function mirrorTile(): Grid {
  return new Pen(16, 16).fn((x, y) => {
    const d = Math.abs(x + y - 15);
    if (d <= 1) return 'c';
    if (d === 2) return x + y < 15 ? 'D' : 'L';
    if (d === 3 && (x + y) % 2 === 0) return 'W';
    return (x < 2 && y > 13) || (x > 13 && y < 2) ? 'D' : null;
  });
}

/** A crystal on a stone base that opens the gate when a bubble hits it. */
export function crystalSwitch(on: boolean): Grid {
  const p = new Pen(16, 16);
  p.rect(3, 13, 10, 3, 'D');
  p.rect(4, 12, 8, 1, 'L');
  const [a, b, c] = on ? (['c', 'W', 'C'] as const) : (['D', 'L', 'k'] as const);
  for (const [x, top, w] of [
    [4, 6, 3],
    [7, 2, 3],
    [10, 5, 3],
  ] as const) {
    for (let y = top; y < 12; y++) {
      for (let i = 0; i < w; i++) p.px(x + i, y, i === 0 ? b : i === w - 1 ? c : a);
    }
  }
  return p.outline();
}

/** A portcullis: iron bars with two cross rails. Drawn translucent once it is open. */
export function gateTile(): Grid {
  return new Pen(16, 16).fn((x, y) => {
    if (y === 2 || y === 3 || y === 12 || y === 13) return 'L';
    if (x % 4 === 1 || x % 4 === 2) return x % 4 === 1 ? 'W' : 'D';
    return null;
  });
}

/** Painted backstage flat: planks and nails. Drawn over a room to hide it until Ben walks in. */
export function facadeTile(): Grid {
  return new Pen(16, 16).fn((x, y) => {
    if (y % 8 === 0) return 'k';
    if ((x === 2 || x === 13) && y % 8 === 3) return 'y';
    return (x + Math.floor(y / 8) * 5) % 9 === 0 ? 'R' : 'N';
  });
}

/** A puffy white ledge with a pale-cyan underside; the flat top is the walking surface. */
function cloudLedge(): Grid {
  const p = new Pen(16, 16);
  p.rect(0, 0, 16, 3, 'W');
  p.ell(4, 3, 4.2, 2.8, 'W');
  p.ell(11.5, 3, 5, 3.2, 'W');
  return p.fn((x, y, c) => (c && !p.at(x, y + 1) ? 'c' : undefined));
}

export function blockTile(bio: Biome): Grid {
  const [a, b, c] = BIOMES[bio].block;
  const p = new Pen(16, 16);
  if (bio === 'citadel') {
    p.ell(8, 8, 8, 8, a);
    for (const [x, y] of [
      [4, 5],
      [10, 4],
      [7, 9],
      [11, 11],
      [4, 11],
    ] as const) {
      p.rect(x, y, 2, 2, 'k');
    }
    return p.fn((_x, _y, cc) => (cc ? undefined : 'R'));
  }
  return p.fn((x, y) =>
    x === 0 || y === 0 ? c : x === 15 || y === 15 ? b : x + y < 10 ? a : x > y ? b : a,
  );
}

export function backTile(bio: Biome, seed: number): Grid {
  const r = spriteRng(seed);
  const p = new Pen(16, 16);
  if (bio === 'foundry') {
    // Pipework: a pipe every eight rows with a highlight, and rivets on the joins.
    return p.fn((x, y) => {
      const r = y % 8;
      if (r === 1) return 'L';
      if (r >= 2 && r <= 4) return x % 8 === 0 ? 'k' : 'D';
      return r === 5 ? 'k' : 'N';
    });
  }
  if (bio === 'theatre') {
    // Velvet curtain: deep folds every four pixels with a lighter ridge between them.
    return p.fn((x, y) => (x % 4 === 0 ? 'k' : x % 4 === 2 && y % 8 < 6 ? 'M' : 'R'));
  }
  if (bio === 'building') {
    // Panelled interior wall: a rail every eight rows and a stud in each panel.
    return p.fn((x, y) => (y % 8 === 0 ? 'D' : y % 8 === 4 && x % 8 === 3 ? 'D' : 'L'));
  }
  if (bio === 'citadel') {
    return p
      .fn((x, y) => {
        const l = y % 8;
        return l < 4 ? 'M' : l === 4 ? 'm' : l === 7 && x % 4 === 0 ? 'm' : 'M';
      })
      .fn((x, y) =>
        x % 16 >= 5 && x % 16 <= 10 && y >= 2 && y <= 6 ? (y === 2 ? 'W' : 'k') : undefined,
      );
  }
  return p.fn((x) => {
    const q = r();
    return x % 8 === 0 && q < 0.5 ? 'k' : q < 0.15 ? 'k' : q < 0.25 ? 'B' : 'D';
  });
}

export function crystal(c1: Colour, c2: Colour): Grid {
  const p = new Pen(16, 16);
  for (const [x, top, w] of [
    [3, 9, 3],
    [7, 4, 4],
    [11, 8, 3],
  ] as const) {
    for (let y = top; y < 16; y++) {
      for (let i = 0; i < w; i++) p.px(x + i - 1, y, i === 0 ? 'W' : i === w - 1 ? c2 : c1);
    }
    p.px(x, top - 1, 'W');
    if (w > 3) p.px(x + 1, top - 1, c1);
  }
  return p.outline();
}

export function spikeTile(): Grid {
  return new Pen(16, 16).fn((x, y) => {
    if (y < 6) return null;
    const lx = (x % 4) - 1.5;
    const w = ((y - 5) / 10) * 2;
    if (Math.abs(lx) > w) return null;
    return y < 8 ? 'W' : lx < 0 ? 'N' : 'R';
  });
}

export function chocTop(f: number): Grid {
  return new Pen(16, 16).fn((x, y) => {
    const s = 3 + Math.round(Math.sin(((x + f * 4) / 16) * Math.PI * 2) * 1.4);
    if (y < s) return null;
    if (y === s) return (x + f * 3) % 7 === 0 ? 'W' : 'y';
    return y < s + 3 ? 'N' : (x + y + f) % 9 === 0 ? 'R' : 'N';
  });
}

export function chocDeep(f: number): Grid {
  return new Pen(16, 16).fn((x, y) => (Math.sin((x + y * 0.6 + f * 3) * 0.7) > 0.75 ? 'R' : 'N'));
}

export function doorTile(c: Colour): Grid {
  return new Pen(16, 16).fn((x, y) => {
    if (x < 2 || x > 13) return c;
    if ((x - 8) ** 2 + (y - 8) ** 2 < 6) return (x + y) % 2 ? 'W' : c;
    return (x * 3 + y * 5) % 11 === 0 ? 'k' : 'N';
  });
}

const GLYPHS: Record<string, string[]> = {
  E: ['111', '100', '110', '100', '111'],
  X: ['101', '101', '010', '101', '101'],
  I: ['1', '1', '1', '1', '1'],
  T: ['111', '010', '010', '010', '010'],
};

export function exitTile(top: boolean): Grid {
  const p = new Pen(16, 16);
  if (!top) {
    return p.fn((x, y) =>
      x < 2 || x > 13 ? 'G' : x === 11 && y === 6 ? 'y' : x === 8 ? 'R' : 'N',
    );
  }
  p.fn((x, y) => (x < 2 || x > 13 ? 'G' : y < 9 ? 'k' : y === 9 ? 'G' : x === 8 ? 'R' : 'N'));
  let cx = 2;
  for (const ch of ['E', 'X', 'I', 'T']) {
    const g = GLYPHS[ch] ?? [];
    g.forEach((row, j) => {
      [...row].forEach((v, i) => {
        if (v === '1') p.px(cx + i, 2 + j, 'y');
      });
    });
    cx += (g[0]?.length ?? 0) + 1;
  }
  return p;
}

export function bridgeTile(): Grid {
  return new Pen(16, 16).fn((x, y) =>
    y === 0
      ? 'W'
      : y === 1 || y === 6
        ? 'L'
        : y > 1 && y < 6 && (x + y) % 6 === 0
          ? 'D'
          : y > 1 && y < 6 && (x - y + 16) % 6 === 0
            ? 'D'
            : null,
  );
}

export function hoverPlat(f: number): Grid {
  const p = new Pen(32, 8);
  p.rect(0, 1, 32, 4, 'L');
  p.rect(0, 0, 32, 1, 'W');
  p.rect(0, 5, 32, 1, 'D');
  for (let x = 3; x < 32; x += 6) p.px(x, 3, f ? 'y' : 'r');
  for (let x = 5; x < 32; x += 10) {
    p.px(x, 6, 'c');
    p.px(x + 1, 6, 'c');
    p.px(x, 7, f ? 'W' : 'c');
  }
  return p;
}

export function switchTile(on: boolean): Grid {
  const p = new Pen(16, 16);
  p.rect(4, 12, 8, 4, 'D');
  p.rect(4, 12, 8, 1, 'L');
  p.line(8, 12, on ? 12 : 4, 5, 'L');
  p.ell(on ? 12.5 : 4.5, 4.5, 2, 2, on ? 'g' : 'r');
  return p.outline();
}

export function terminal(f: number): Grid {
  const p = new Pen(16, 24);
  p.rect(2, 3, 12, 21, 'D');
  p.rect(2, 3, 12, 1, 'L');
  p.rect(4, 5, 8, 7, f ? 'g' : 'G');
  for (let y = 6; y < 11; y += 2) p.rect(5, y, ((y * 3) % 6) + 2, 1, f ? 'k' : 'g');
  p.rect(6, 14, 4, 1, 'y');
  for (let y = 17; y < 22; y += 2) for (let x = 4; x < 12; x += 2) p.px(x, y, 'L');
  return p.outline();
}
