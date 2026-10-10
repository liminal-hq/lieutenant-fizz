// Stand-in for the gamepad plugin's guest package when no checkout of it is configured (see `vite.config.ts`).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

const missing = (): never => {
  throw new Error('The gamepad plugin guest is not built in: set GAMEPAD_HAPTICS_GUEST');
};

export const PATTERN_FORMAT = 'haptics-lab/pattern@1';
export const capabilities = missing;
export const listPads = missing;
export const playFrames = missing;
export const identify = missing;
export const stop = missing;
export const onPadConnected = missing;
export const onPadChanged = missing;
export const onPadDisconnected = missing;
export const createBackend = missing;
export const resolvePad = missing;
