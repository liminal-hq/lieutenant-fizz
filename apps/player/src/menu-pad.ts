// Gamepad navigation for the player app's own pages: pure input mapping and a polling step.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What a pad asked for on one poll. */
export type PadIntent = 'wake' | 'up' | 'down' | 'activate' | 'back' | null;

export interface PadSnapshot {
  /** Pressed state per button index (standard mapping). */
  buttons: readonly boolean[];
  axes: readonly number[];
}

export interface PadState {
  /** -1 up, 1 down, 0 neutral: the direction held on the last poll. */
  held: -1 | 0 | 1;
  /** When the held direction may repeat. */
  repeatAt: number;
  activateDown: boolean;
  backDown: boolean;
  /** Whether any input has been seen yet; the first press only wakes the menu. */
  awake: boolean;
}

export const BUTTON_A = 0;
export const BUTTON_B = 1;
export const BUTTON_DPAD_UP = 12;
export const BUTTON_DPAD_DOWN = 13;
export const AXIS_LEFT_Y = 1;
export const AXIS_THRESHOLD = 0.6;
export const REPEAT_FIRST_MS = 350;
export const REPEAT_NEXT_MS = 120;

export const initialPadState = (): PadState => ({
  held: 0,
  repeatAt: 0,
  activateDown: false,
  backDown: false,
  awake: false,
});

const direction = (pad: PadSnapshot): -1 | 0 | 1 => {
  const y = pad.axes[AXIS_LEFT_Y] ?? 0;
  const up = pad.buttons[BUTTON_DPAD_UP] === true || y < -AXIS_THRESHOLD;
  const down = pad.buttons[BUTTON_DPAD_DOWN] === true || y > AXIS_THRESHOLD;
  if (up === down) return 0;
  return up ? -1 : 1;
};

/** Maps one poll of a pad to at most one intent. Movement repeats after 350 ms, then every 120 ms; buttons fire on press. */
export const stepPad = (
  state: PadState,
  pad: PadSnapshot,
  now: number,
): { state: PadState; intent: PadIntent } => {
  const dir = direction(pad);
  const activate = pad.buttons[BUTTON_A] === true;
  const back = pad.buttons[BUTTON_B] === true;
  const next: PadState = { ...state, held: dir, activateDown: activate, backDown: back };

  let intent: PadIntent = null;
  if (dir !== 0 && dir !== state.held) {
    intent = dir < 0 ? 'up' : 'down';
    next.repeatAt = now + REPEAT_FIRST_MS;
  } else if (dir !== 0 && now >= state.repeatAt) {
    intent = dir < 0 ? 'up' : 'down';
    next.repeatAt = now + REPEAT_NEXT_MS;
  } else if (activate && !state.activateDown) {
    intent = 'activate';
  } else if (back && !state.backDown) {
    intent = 'back';
  }

  if (intent !== null && !state.awake) {
    next.awake = true;
    intent = 'wake';
  }
  return { state: next, intent };
};

export interface PadLoopHost {
  getPads(): ReadonlyArray<PadSnapshot | null>;
  /** Called once per intent. */
  onIntent(intent: Exclude<PadIntent, null>): void;
}

/** One poll across every connected pad, updating the state kept per pad slot. */
export const pollPads = (states: PadState[], host: PadLoopHost, now: number): void => {
  host.getPads().forEach((pad, i) => {
    if (!pad) return;
    const { state, intent } = stepPad(states[i] ?? initialPadState(), pad, now);
    states[i] = state;
    if (intent !== null) host.onIntent(intent);
  });
};

/** Moves focus through a list with wrap-around; `from` is the index now focused, or -1. */
export const nextFocus = (from: number, count: number, step: -1 | 1): number => {
  if (count === 0) return -1;
  if (from < 0) return step > 0 ? 0 : count - 1;
  return (from + step + count) % count;
};
