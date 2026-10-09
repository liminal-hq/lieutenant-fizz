// Tests for the table of menu row densities.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DENSITY,
  DENSITIES,
  DENSITY_COUNT,
  densityName,
  densityOf,
  densityRow,
} from './menu-density';

describe('DENSITIES', () => {
  it('names Compact, Cozy and Comfy at 36, 40 and 48 dp, in the order they are stored', () => {
    expect(DENSITIES.map((d) => [d.name, d.dp])).toEqual([
      ['Compact', 36],
      ['Cozy', 40],
      ['Comfy', 48],
    ]);
    expect(DENSITY_COUNT).toBe(3);
  });

  it('grows from Compact to Comfy', () => {
    const rows = DENSITIES.map((d) => d.dp);
    expect([...rows].sort((a, b) => a - b)).toEqual(rows);
  });

  it('makes Cozy the default', () => {
    expect(densityName(DEFAULT_DENSITY)).toBe('Cozy');
    expect(densityRow(DEFAULT_DENSITY)).toBe(40);
  });
});

describe('densityOf', () => {
  it('reads each stored index', () => {
    expect(densityRow(0)).toBe(36);
    expect(densityRow(1)).toBe(40);
    expect(densityRow(2)).toBe(48);
    expect(densityName(2)).toBe('Comfy');
  });

  it('falls back to the default for an index outside the table', () => {
    expect(densityOf(-1)).toBe(DENSITIES[DEFAULT_DENSITY]);
    expect(densityOf(3)).toBe(DENSITIES[DEFAULT_DENSITY]);
    expect(densityOf(Number.NaN)).toBe(DENSITIES[DEFAULT_DENSITY]);
  });
});
