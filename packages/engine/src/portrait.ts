// Whether a window is held upright, which a landscape game answers with a "Rotate your phone" screen.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Whether a window of this size is taller than it is wide (a phone held upright). */
export const isPortrait = (width: number, height: number): boolean => height > width;
