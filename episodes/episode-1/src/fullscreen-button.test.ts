// Tests for the fullscreen button's glyphs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { GLYPHS, GLYPH_SIZE, glyphGrid } from './fullscreen-button';

describe('the fullscreen glyphs', () => {
  it('are square grids of the same size, drawn only with W and .', () => {
    for (const rows of Object.values(GLYPHS)) {
      expect(rows).toHaveLength(GLYPH_SIZE);
      for (const row of rows) expect(row).toMatch(new RegExp(`^[W.]{${GLYPH_SIZE}}$`));
    }
  });

  it('are mirror images across both axes, so the four corners match', () => {
    for (const rows of Object.values(GLYPHS)) {
      for (let y = 0; y < GLYPH_SIZE; y++) {
        for (let x = 0; x < GLYPH_SIZE; x++) {
          const at = rows[y]?.[x];
          expect(rows[y]?.[GLYPH_SIZE - 1 - x]).toBe(at);
          expect(rows[GLYPH_SIZE - 1 - y]?.[x]).toBe(at);
        }
      }
    }
  });

  it('differ: Expand keeps its pixels at the edges, Collapse toward the middle', () => {
    expect(GLYPHS.expand).not.toEqual(GLYPHS.collapse);
    expect(GLYPHS.expand[0]?.[0]).toBe('W');
    expect(GLYPHS.collapse[0]?.[0]).toBe('.');
    expect(GLYPHS.collapse[3]).toBe('WWWW.WWWW');
  });

  it('become sprite grids that are white where lit and clear elsewhere', () => {
    const g = glyphGrid('expand');
    expect(g.w).toBe(GLYPH_SIZE);
    expect(g.h).toBe(GLYPH_SIZE);
    expect(g.at(0, 0)).toBe('W');
    expect(g.at(4, 4)).toBeNull();
    expect(g.at(-1, 0)).toBeNull();
    expect(g.at(0, GLYPH_SIZE)).toBeNull();
  });
});
