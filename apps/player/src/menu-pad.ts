// Gamepad navigation for the player app's own pages: pure input mapping and a polling step.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What a pad asked for on one poll. */
export type PadIntent = 'wake' | Direction | 'activate' | 'back' | null;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PadSnapshot {
  /** Pressed state per button index (standard mapping). */
  buttons: readonly boolean[];
  axes: readonly number[];
}

export interface PadState {
  /** The direction held on the last poll. */
  held: Direction | null;
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
export const BUTTON_DPAD_LEFT = 14;
export const BUTTON_DPAD_RIGHT = 15;
export const AXIS_LEFT_X = 0;
export const AXIS_LEFT_Y = 1;
export const AXIS_THRESHOLD = 0.6;
export const REPEAT_FIRST_MS = 350;
export const REPEAT_NEXT_MS = 120;

export const initialPadState = (): PadState => ({
  held: null,
  repeatAt: 0,
  activateDown: false,
  backDown: false,
  awake: false,
});

const direction = (pad: PadSnapshot): Direction | null => {
  const x = pad.axes[AXIS_LEFT_X] ?? 0;
  const y = pad.axes[AXIS_LEFT_Y] ?? 0;
  const up = pad.buttons[BUTTON_DPAD_UP] === true || y < -AXIS_THRESHOLD;
  const down = pad.buttons[BUTTON_DPAD_DOWN] === true || y > AXIS_THRESHOLD;
  const left = pad.buttons[BUTTON_DPAD_LEFT] === true || x < -AXIS_THRESHOLD;
  const right = pad.buttons[BUTTON_DPAD_RIGHT] === true || x > AXIS_THRESHOLD;
  // Opposing inputs cancel; vertical wins over horizontal when both axes are held.
  if (up !== down) return up ? 'up' : 'down';
  if (left !== right) return left ? 'left' : 'right';
  return null;
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
  if (dir !== null && dir !== state.held) {
    intent = dir;
    next.repeatAt = now + REPEAT_FIRST_MS;
  } else if (dir !== null && now >= state.repeatAt) {
    intent = dir;
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
  // Only one intent leaves a poll. When movement took it, a button pressed on the same frame has not been acted on,
  // so leave its edge unrecorded and it fires on the next poll.
  if (intent === 'up' || intent === 'down' || intent === 'left' || intent === 'right') {
    next.activateDown = state.activateDown;
    next.backDown = state.backDown;
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
  const pads = host.getPads();
  // A controller that has gone leaves no state behind, so whatever takes its slot next starts fresh.
  if (states.length > pads.length) states.length = pads.length;
  pads.forEach((pad, i) => {
    if (!pad) {
      delete states[i];
      return;
    }
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

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Picks the control to focus after a direction. Up and down take the nearest control above or below, preferring the
 * one most in line, and wrap through the list order when none is left. Left and right stay in the same row.
 * Returns -1 when there is nowhere to go.
 */
export const pickFocus = (boxes: readonly Box[], from: number, dir: Direction): number => {
  const vertical = dir === 'up' || dir === 'down';
  const here = boxes[from];
  if (!here) return boxes.length === 0 ? -1 : dir === 'up' ? boxes.length - 1 : 0;
  const cx = (here.left + here.right) / 2;
  const cy = (here.top + here.bottom) / 2;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((box, i) => {
    if (i === from) return;
    const x = (box.left + box.right) / 2;
    const y = (box.top + box.bottom) / 2;
    let primary: number;
    let score: number;
    if (vertical) {
      primary = dir === 'up' ? cy - y : y - cy;
      score = primary + 3 * Math.abs(x - cx);
    } else {
      if (box.top >= here.bottom || box.bottom <= here.top) return;
      primary = dir === 'left' ? cx - x : x - cx;
      score = primary;
    }
    if (primary <= 1 || score >= bestScore) return;
    best = i;
    bestScore = score;
  });
  if (best >= 0 || !vertical) return best;
  return nextFocus(from, boxes.length, dir === 'up' ? -1 : 1);
};

/** Steps a number by `step` in a direction, clamped to its range and snapped to the step grid from `min`. */
export const stepValue = (
  value: number,
  min: number,
  max: number,
  step: number,
  dir: 'left' | 'right',
): number => {
  const next = value + (dir === 'right' ? step : -step);
  const snapped = min + Math.round((next - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
};
