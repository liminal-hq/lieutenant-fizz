// The title screen's attract loop: which levels it shows, its label and the fade between them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The levels the sim's attract mode pans across, in order. */
export const ATTRACT_LEVELS = ['Crater Fields', 'Crystal Caves', 'Mildred’s Citadel'] as const;

/** Seconds the screen takes to fade to black at the end of a level, and back in at the start. */
export const ATTRACT_FADE = 0.5;

/** The ticks per second the sim runs at. */
const TICKS_PER_SECOND = 60;

/** The next level in the loop. */
export const nextAttract = (idx: number): number => (idx + 1) % ATTRACT_LEVELS.length;

/** The label shown bottom-right, such as `Attract · Crystal Caves`. */
export const attractLabel = (idx: number): string =>
  `Attract · ${ATTRACT_LEVELS[idx % ATTRACT_LEVELS.length]}`;

/**
 * How black the screen is, from 0 to 1, `ticks` into a level that lasts `period` ticks. It fades in
 * over the first half second and out over the last. Under reduced motion there is no fade.
 */
export function attractFade(ticks: number, period: number, reduced: boolean): number {
  if (reduced || period <= 0) return 0;
  const seconds = ticks / TICKS_PER_SECOND;
  const left = (period - ticks) / TICKS_PER_SECOND;
  return Math.max(0, Math.min(1, 1 - Math.min(seconds, left) / ATTRACT_FADE));
}
