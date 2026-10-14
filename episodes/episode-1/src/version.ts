// The game's version, set at build time from the player app's package.json; 'dev' where nothing sets it (tests, plain imports).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare const __GAME_VERSION__: string | undefined;

export const GAME_VERSION: string = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : 'dev';
