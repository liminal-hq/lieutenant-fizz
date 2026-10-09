// The four haptic strengths a player chooses between (Off, Light, Medium, Strong) and the master scale each one means.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The names of the strengths, by level: 0 is Off and 3 is Strong. */
export const STRENGTH_NAMES = ['Off', 'Light', 'Medium', 'Strong'] as const;

/** The master scale of each level, as `GameHaptics.setScale` takes it: 1 plays a cue as written. */
export const STRENGTH_SCALE: readonly number[] = [0, 0.5, 0.75, 1];

/** The level a player starts on, and the one an unreadable stored value becomes. */
export const DEFAULT_STRENGTH = 3;

/** The highest level. */
export const MAX_STRENGTH = STRENGTH_NAMES.length - 1;

/** Whether `v` is a whole number from 0 to 3. */
export const isStrength = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_STRENGTH;

/** The name of a level (Strong for anything out of range). */
export const strengthName = (level: number): string =>
  STRENGTH_NAMES[isStrength(level) ? level : DEFAULT_STRENGTH] ?? 'Strong';

/** The master scale of a level (the default level's for anything out of range). */
export const strengthScale = (level: number): number =>
  STRENGTH_SCALE[isStrength(level) ? level : DEFAULT_STRENGTH] ?? 1;

/**
 * One step along the levels, `d` of -1 or +1. At the ends a step stops; choosing a row (`wrap`) goes
 * round to the other end.
 */
export function stepStrength(level: number, d: number, wrap: boolean): number {
  const n = STRENGTH_NAMES.length;
  const i = (isStrength(level) ? level : DEFAULT_STRENGTH) + d;
  return wrap ? ((i % n) + n) % n : Math.min(MAX_STRENGTH, Math.max(0, i));
}
