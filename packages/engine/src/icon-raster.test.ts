// Checks the icon rasteriser: the SVG subset it accepts, how shapes land on pixels and the maskable safe zone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseIconSvg, rasteriseIcon, type Raster } from './icon-raster';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const icon = readFileSync(join(root, 'assets/icon/fizz-icon.svg'), 'utf8');

const svg = (size: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
const at = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

describe('parseIconSvg', () => {
  it('accepts the committed icon', () => {
    const doc = parseIconSvg(icon);
    expect(doc.size).toBe(512);
    expect(doc.shapes.length).toBe(31);
    expect(doc.shapes.filter((s) => s.kind === 'path').length).toBe(7);
  });

  it('keeps the committed icon free of embedded metadata', () => {
    expect(icon).not.toMatch(/metadata|c2pa/i);
  });

  it('rejects an <ellipse>', () => {
    expect(() =>
      parseIconSvg(svg(8, '<ellipse cx="4" cy="4" rx="2" ry="1" fill="#ffffff"></ellipse>')),
    ).toThrow(/unsupported SVG element <ellipse>/);
  });

  it('rejects metadata and groups', () => {
    expect(() => parseIconSvg(svg(8, '<metadata>x</metadata>'))).toThrow(/<metadata>/);
    expect(() => parseIconSvg(svg(8, '<g></g>'))).toThrow(/<g>/);
  });

  it('rejects an unknown path command', () => {
    expect(() => parseIconSvg(svg(8, '<path d="M1 1L3 3Z" fill="#ffffff"></path>'))).toThrow(
      /path command "L"/,
    );
    expect(() => parseIconSvg(svg(8, '<path d="M1 1h2v2h-2z" fill="#ffffff"></path>'))).toThrow(
      /path command "z"/,
    );
  });

  it('rejects a path that is not a closed rectangle', () => {
    expect(() => parseIconSvg(svg(8, '<path d="M1 1h2v2h-3Z" fill="#ffffff"></path>'))).toThrow(
      /closed rectangle/,
    );
  });

  it('rejects an unknown attribute, a transform and a colour name', () => {
    expect(() =>
      parseIconSvg(
        svg(8, '<rect width="1" height="1" fill="#ffffff" transform="scale(2)"></rect>'),
      ),
    ).toThrow(/attribute transform/);
    expect(() => parseIconSvg(svg(8, '<rect width="1" height="1" fill="red"></rect>'))).toThrow(
      /unsupported colour/,
    );
  });
});

describe('rasteriseIcon', () => {
  it('puts a 2×2 rect on exactly its four pixels', () => {
    const r = rasteriseIcon(
      svg(4, '<rect x="1" y="1" width="2" height="2" fill="#112233"></rect>'),
      4,
    );
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const inside = x >= 1 && x <= 2 && y >= 1 && y <= 2;
        expect(at(r, x, y), `pixel ${x},${y}`).toEqual(
          inside ? [0x11, 0x22, 0x33, 255] : [0, 0, 0, 0],
        );
      }
    }
  });

  it('gives a half-covered pixel half alpha and the full colour (supersampled edge values)', () => {
    const half = rasteriseIcon(
      svg(1, '<rect x="0" y="0" width="0.5" height="1" fill="#ff0000"></rect>'),
      1,
    );
    expect(at(half, 0, 0)).toEqual([255, 0, 0, 128]);
    const quarter = rasteriseIcon(
      svg(1, '<rect x="0" y="0" width="0.5" height="0.5" fill="#ff0000"></rect>'),
      1,
    );
    expect(at(quarter, 0, 0)).toEqual([255, 0, 0, 64]);
    const sliver = rasteriseIcon(
      svg(1, '<rect x="0" y="0" width="0.25" height="1" fill="#ff0000"></rect>'),
      1,
    );
    expect(at(sliver, 0, 0)).toEqual([255, 0, 0, 64]);
  });

  it('leaves the corners of a rounded rect transparent and its middle opaque', () => {
    const r = rasteriseIcon(
      svg(32, '<rect width="32" height="32" rx="8" fill="#0A0A0D"></rect>'),
      32,
    );
    expect(at(r, 0, 0)[3]).toBe(0);
    expect(at(r, 31, 0)[3]).toBe(0);
    expect(at(r, 0, 31)[3]).toBe(0);
    expect(at(r, 31, 31)[3]).toBe(0);
    expect(at(r, 16, 16)).toEqual([10, 10, 13, 255]);
    expect(at(r, 8, 0)).toEqual([10, 10, 13, 255]);
    expect(at(r, 0, 8)).toEqual([10, 10, 13, 255]);
  });

  it('blends opacity over what is beneath, and over nothing', () => {
    const over = rasteriseIcon(
      svg(
        2,
        '<rect width="2" height="2" fill="#000000"></rect><rect width="2" height="2" fill="#ffffff" opacity="0.5"></rect>',
      ),
      2,
    );
    expect(at(over, 0, 0)).toEqual([128, 128, 128, 255]);
    const alone = rasteriseIcon(
      svg(2, '<rect width="2" height="2" fill="#ffffff" opacity="0.5"></rect>'),
      2,
    );
    expect(at(alone, 1, 1)).toEqual([255, 255, 255, 128]);
  });

  it('fills a circle, with a soft edge', () => {
    const r = rasteriseIcon(svg(16, '<circle cx="8" cy="8" r="6" fill="#00ff00"></circle>'), 16);
    expect(at(r, 8, 8)).toEqual([0, 255, 0, 255]);
    expect(at(r, 0, 0)[3]).toBe(0);
    const edge = at(r, 12, 3)[3] as number;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('draws a path of squares once, even where they overlap', () => {
    const r = rasteriseIcon(
      svg(4, '<path d="M0 0h2v2h-2ZM1 1h2v2h-2Z" fill="#ffffff" opacity="0.5"></path>'),
      4,
    );
    expect(at(r, 1, 1)).toEqual([255, 255, 255, 128]);
    expect(at(r, 0, 0)).toEqual([255, 255, 255, 128]);
  });

  it('scales about the centre and can start from a solid background', () => {
    const r = rasteriseIcon(svg(8, '<rect width="8" height="8" fill="#ffffff"></rect>'), 8, {
      scale: 0.5,
      background: '#000000',
    });
    expect(at(r, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(at(r, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(at(r, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(at(r, 6, 6)).toEqual([0, 0, 0, 255]);
  });

  it('draws the committed icon with transparent corners and an opaque centre', () => {
    const r = rasteriseIcon(icon, 128);
    expect(at(r, 0, 0)[3]).toBe(0);
    expect(at(r, 64, 20)[3]).toBe(255);
  });
});

describe('the maskable icon', () => {
  it('keeps every pixel that is not the background inside the safe circle of 0.4 × the size', () => {
    const size = 512;
    const bg = [10, 10, 13, 255];
    const r = rasteriseIcon(icon, size, { background: '#0A0A0D', scale: 0.8 });
    const limit = 0.4 * size;
    let far = 0; // the furthest drawn pixel from the centre
    let drawn = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = at(r, x, y);
        if (p.every((v, i) => v === bg[i])) continue;
        drawn++;
        // The pixel's farthest corner, so a pixel that straddles the circle fails.
        const dx = Math.max(Math.abs(x - size / 2), Math.abs(x + 1 - size / 2));
        const dy = Math.max(Math.abs(y - size / 2), Math.abs(y + 1 - size / 2));
        far = Math.max(far, Math.hypot(dx, dy));
      }
    }
    expect(drawn).toBeGreaterThan(50_000);
    expect(far).toBeLessThanOrEqual(limit);
  });

  it('is opaque everywhere, so a launcher can crop it to any shape', () => {
    const r = rasteriseIcon(icon, 64, { background: '#0A0A0D', scale: 0.8 });
    for (let i = 3; i < r.data.length; i += 4) expect(r.data[i]).toBe(255);
  });
});
