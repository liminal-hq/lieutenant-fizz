// The state machine behind a "press a button for Jump" screen: idle, listening and result.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure, with the time and the held buttons passed in, so it is unit-tested without a gamepad or a clock.
// A screen (the episode's Controller screen, the launcher's) feeds it the pad's pressed buttons each
// frame and draws what it reports.

import {
  BINDABLE_BUTTONS,
  PAD_ACTION_NAMES,
  bindButton,
  type PadAction,
  type PadBindings,
} from './gamepad-bindings';
import { padButtonName, type PadFamily } from './gamepad-labels';

/** How long a screen listens for a button before it gives up, in milliseconds. */
export const LISTEN_TIMEOUT_MS = 8000;

/** How long Start must be held to cancel, in milliseconds. A shorter press binds Start itself. */
export const CANCEL_HOLD_MS = 1000;

/** How long the result of a binding stays up, in milliseconds. */
export const RESULT_MS = 1800;

/** The Start button, whose hold cancels. */
const START = 9;

/** Why listening ended without a binding. */
export type CancelReason = 'key' | 'touch' | 'pad' | 'timeout';

export type RemapState =
  | { kind: 'idle' }
  | {
      kind: 'listening';
      action: PadAction;
      /** When listening began. */
      since: number;
      /** Buttons held when it began (or since): they are ignored until they come up. */
      ignore: readonly number[];
      /** When a fresh Start press began, or null: it binds on release and cancels when held. */
      startAt: number | null;
    }
  | {
      kind: 'result';
      action: PadAction;
      /** When the result appeared. */
      since: number;
      /** The button bound, or null when listening ended without one. */
      button: number | null;
      /** Why it ended without a button. */
      cancelled: CancelReason | null;
      /** The action that gave up the button, if another had it. */
      from: PadAction | null;
      /** Whether that action took this one's old buttons in exchange. */
      swapped: boolean;
    };

export const IDLE: RemapState = { kind: 'idle' };

/** Starts listening for `action`. `held` are the buttons down right now, which are ignored until released. */
export function startListening(
  action: PadAction,
  now: number,
  held: ReadonlySet<number>,
): RemapState {
  return { kind: 'listening', action, since: now, ignore: [...held], startAt: null };
}

/** What a step did: the new state, and the bindings if a button was bound. */
export interface RemapStep {
  state: RemapState;
  bindings: PadBindings;
  /** Whether `bindings` changed (and should be saved). */
  changed: boolean;
}

const result = (
  s: Extract<RemapState, { kind: 'listening' }>,
  now: number,
  button: number | null,
  cancelled: CancelReason | null,
  from: PadAction | null = null,
  swapped = false,
): RemapState => ({
  kind: 'result',
  action: s.action,
  since: now,
  button,
  cancelled,
  from,
  swapped,
});

/**
 * One frame. While listening, the lowest button that is bindable, newly pressed (not one of the
 * ignored ones) binds to the action; the D-pad and sticks are never looked at. Start binds when it is
 * released and cancels when held for {@link CANCEL_HOLD_MS}. Eight seconds with nothing cancels. A
 * result goes back to idle after {@link RESULT_MS}.
 */
export function stepRemap(
  state: RemapState,
  bindings: PadBindings,
  now: number,
  pressed: ReadonlySet<number>,
): RemapStep {
  const same = { state, bindings, changed: false };
  if (state.kind === 'idle') return same;
  if (state.kind === 'result') {
    return now - state.since >= RESULT_MS ? { ...same, state: IDLE } : same;
  }
  const cancel = (reason: CancelReason): RemapStep => ({
    ...same,
    state: result(state, now, null, reason),
  });
  if (now - state.since >= LISTEN_TIMEOUT_MS) return cancel('timeout');

  // A button held when listening began stays ignored until it comes up.
  const ignore = state.ignore.filter((i) => pressed.has(i));
  let startAt = state.startAt;
  if (startAt !== null) {
    if (pressed.has(START)) {
      if (now - startAt >= CANCEL_HOLD_MS) return cancel('pad');
    } else return bind(state, bindings, now, START);
  }
  const fresh = BINDABLE_BUTTONS.find((i) => pressed.has(i) && !ignore.includes(i));
  if (fresh === START && startAt === null) startAt = now;
  else if (fresh !== undefined && fresh !== START) return bind(state, bindings, now, fresh);
  return { ...same, state: { ...state, ignore, startAt } };
}

function bind(
  s: Extract<RemapState, { kind: 'listening' }>,
  bindings: PadBindings,
  now: number,
  button: number,
): RemapStep {
  const r = bindButton(bindings, s.action, button);
  return {
    state: result(s, now, button, null, r.from, r.swapped),
    bindings: r.bindings,
    changed: r.bindings !== bindings,
  };
}

/** Ends listening because the player cancelled with the keyboard, a touch or the pad. Idle and result stay as they are. */
export function cancelRemap(
  state: RemapState,
  now: number,
  reason: Exclude<CancelReason, 'timeout'>,
): RemapState {
  return state.kind === 'listening' ? result(state, now, null, reason) : state;
}

/** The line for a screen to show: what to press while listening, or what happened. Empty when idle. */
export function remapMessage(state: RemapState, family: PadFamily): string {
  if (state.kind === 'idle') return '';
  const name = PAD_ACTION_NAMES[state.action];
  if (state.kind === 'listening') return `Press a button for ${name}`;
  if (state.button === null)
    return state.cancelled === 'timeout' ? 'No button pressed' : 'Cancelled';
  const btn = padButtonName(state.button, family);
  if (state.from && state.swapped)
    return `${name} is now ${btn}, and ${PAD_ACTION_NAMES[state.from]} took its old button`;
  if (state.from) return `${name} is now ${btn}, taken from ${PAD_ACTION_NAMES[state.from]}`;
  return `${name} is now ${btn}`;
}
