// The touch menu row heights the player can choose: one table of named densities, and the default.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A named menu row height, in CSS pixels (which are dp on a phone). */
export interface Density {
  /** The name the Row spacing setting shows. */
  name: string;
  /** The height of one menu row. */
  dp: number;
}

/**
 * The one table of row heights, in the order the setting stores them (0, 1, 2). Change a number here
 * to retune a density; `--lf-menu-row` follows it. Android asks for 48 dp targets, so Comfy meets that
 * and Cozy and Compact trade target size for more rows on a short phone.
 */
export const DENSITIES: readonly Density[] = [
  { name: 'Compact', dp: 36 },
  { name: 'Cozy', dp: 40 },
  { name: 'Comfy', dp: 48 },
];

/** How many densities there are, for the stored setting's range. */
export const DENSITY_COUNT = DENSITIES.length;

/** The stored index of the default density, Cozy. */
export const DEFAULT_DENSITY = 1;

/** The density a stored index names; anything out of range gives the default. */
export const densityOf = (index: number): Density =>
  DENSITIES[index] ?? DENSITIES[DEFAULT_DENSITY]!;

/** The row height, in CSS pixels, of a stored density index. */
export const densityRow = (index: number): number => densityOf(index).dp;

/** The name of a stored density index, as the setting shows it. */
export const densityName = (index: number): string => densityOf(index).name;
