// The two-tap Reset shared by the Touch controls and Sound screens: a first tap arms it for a few seconds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** How long a first tap on Reset stays armed, in milliseconds. */
export const RESET_ARM_MS = 3000;

/** Whether a Reset armed at `at` (a time in milliseconds, or null) is still waiting for its second tap at `now`. */
export function resetArmed(at: number | null, now: number): boolean {
  return at !== null && now - at < RESET_ARM_MS;
}
