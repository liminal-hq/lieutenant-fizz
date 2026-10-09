// The menu row heights the browser specs expect, matching the table in `menu-density.ts`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Compact, Cozy and Comfy row heights in dp, in the order the Row spacing option stores them. */
export const ROW_DP = [36, 40, 48] as const;

/** The default density's row height (Cozy): the least a menu row may measure on touch. */
export const ROW_MIN = ROW_DP[1] - 0.1;

/** The least width of a Row spacing stepper, which is as wide as the row is tall and at least 40 dp. */
export const STEP_MIN = Math.max(40, ROW_DP[1]) - 0.1;
