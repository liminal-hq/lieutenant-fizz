// Constants shared with the Rust sim for input bits, states, events and outputs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Constants shared with the Rust sim (episodes/episode-1/game/src). Keep in sync; the
// integration test in sim.test.ts exercises each group against the real WASM.

/** Input bits passed to `step`. */
export const Input = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  JUMP: 16,
  POGO: 32,
  FIRE: 64,
  CONFIRM: 128,
} as const;

/** Render flag bits passed to `render`. */
export const RenderFlag = { NIGHT: 1, CULLING: 2, STRESS: 4 } as const;

/** Event kinds emitted by the sim. */
export const Ev = {
  CAPTION: 1,
  HUD: 2,
  TOAST: 3,
  LEVEL_COMPLETE: 4,
  DIED: 5,
  GAME_OVER: 6,
  DIALOGUE: 7,
  BOSS_HP: 8,
  ENDING: 9,
  MAP_PROMPT: 10,
  LEVEL_START: 11,
} as const;

/** Indices into the per-frame `out` array. */
export const Out = {
  COUNT: 0,
  CAM_X: 1,
  CAM_Y: 2,
  LIGHTS: 3,
  WORLD: 4,
  CLEAR_R: 5,
  CLEAR_G: 6,
  CLEAR_B: 7,
  CLEAR_A: 8,
  AMB_R: 9,
  AMB_G: 10,
  AMB_B: 11,
  LIGHTING: 12,
  SKY_GLOW: 13,
} as const;

/** Indices for `state_get` / `state_set`. */
export const State = {
  LIVES: 0,
  SCORE: 1,
  NEXT_LIFE: 2,
  AMMO: 3,
  DONE_MASK: 4,
  MAP_X: 5,
  MAP_Y: 6,
  HAS_MAP_POS: 7,
  KEY_RED: 8,
  KEY_BLUE: 9,
  HAS_USB: 10,
  BOSS_HP: 11,
  POGO_HEIGHT: 12,
  PLAYER_X: 13,
  PLAYER_Y: 14,
  PLAYER_DEAD: 15,
  TICK: 16,
  LEVEL_ID: 17,
  WON: 18,
  KEY_GREEN: 19,
  ATTRACT_T: 20,
  ATTRACT_PERIOD: 21,
  ATTRACT_IDX: 22,
  POGO_ON: 23,
} as const;

/** Sim modes returned by `mode()`. */
export const Mode = { NONE: 0, ATTRACT: 1, MAP: 2, LEVEL: 3 } as const;

/** Name tables the Rust side owns. */
export const Table = { SPRITES: 0, CAPTIONS: 1, TOASTS: 2 } as const;

/** Level ids. */
export const Level = { CRATER: 0, CAVES: 1, CITADEL: 2 } as const;

export const STRIDE = 20;
export const STEP = 1 / 60;
