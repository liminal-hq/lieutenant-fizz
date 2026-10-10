// The state machine behind a "press buttons for Pogo" screen: idle, listening and result.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure, with the time and the held buttons passed in, so it is unit-tested without a gamepad or a clock.
// A screen (the episode's Controller screen, the launcher's) feeds it the pad's pressed buttons each
// frame and draws what it reports.
//
// A listen collects presses. The first fresh press replaces the action's buttons with that one, each
// further fresh press adds a button (or takes it out again if it is already collected: a toggle, which
// never empties the set), and the listen finishes once no press has followed the last one for a moment.
// Nothing is bound until it finishes, so a cancel leaves the old bindings.

import {
  BINDABLE_BUTTONS,
  PAD_ACTIONS,
  PAD_ACTION_NAMES,
  setButtons,
  type PadAction,
  type PadBindings,
} from './gamepad-bindings';
import { padButtonName, type PadFamily } from './gamepad-labels';

/** How long a screen waits for a first button before it gives up, in milliseconds. */
export const LISTEN_TIMEOUT_MS = 8000;

/** How long after the last press a listen finishes by itself, in milliseconds. */
export const FINISH_MS = 1500;

/** How long Start must be held to cancel, in milliseconds. A shorter press counts as a press of Start. */
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
      /**
       * The buttons that were down on the last frame. A press is a button down now that was not: a button
       * held when listening began counts as down until it is released.
       */
      held: readonly number[];
      /** The buttons collected so far, empty until the first press. */
      buttons: readonly number[];
      /** When the last press landed (meaningful once `buttons` is not empty). */
      lastAt: number;
      /** When a fresh Start press began, or null: it counts as a press on release and cancels when held. */
      startAt: number | null;
    }
  | {
      kind: 'result';
      action: PadAction;
      /** When the result appeared. */
      since: number;
      /** The action's buttons now, or null when listening ended without a binding. */
      buttons: readonly number[] | null;
      /** Why it ended without a binding. */
      cancelled: CancelReason | null;
      /** The actions that lost one of the buttons. */
      lost: readonly PadAction[];
      /** The actions that keep a button too, because they would otherwise have been left with none. */
      shared: readonly PadAction[];
    };

export const IDLE: RemapState = { kind: 'idle' };

/** Starts listening for `action`. `held` are the buttons down right now, which are ignored until released. */
export function startListening(
  action: PadAction,
  now: number,
  held: ReadonlySet<number>,
): RemapState {
  return {
    kind: 'listening',
    action,
    since: now,
    held: [...held],
    buttons: [],
    lastAt: now,
    startAt: null,
  };
}

/** What a step did: the new state, and the bindings (changed when a listen finished with new buttons). */
export interface RemapStep {
  state: RemapState;
  bindings: PadBindings;
  /** Whether `bindings` changed (and should be saved). */
  changed: boolean;
}

type Listening = Extract<RemapState, { kind: 'listening' }>;

const sameList = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameBindings = (a: PadBindings, b: PadBindings): boolean =>
  PAD_ACTIONS.every((x) => sameList(a[x], b[x]));

const cancelled = (s: Listening, now: number, reason: CancelReason): RemapState => ({
  kind: 'result',
  action: s.action,
  since: now,
  buttons: null,
  cancelled: reason,
  lost: [],
  shared: [],
});

/** One press: the first replaces, a new button is added, a collected one is taken out unless it is the last. */
function press(buttons: readonly number[], b: number): readonly number[] {
  if (buttons.length === 0) return [b];
  if (!buttons.includes(b)) return [...buttons, b];
  return buttons.length > 1 ? buttons.filter((i) => i !== b) : buttons;
}

/** Ends a listen that has collected buttons: binds them. */
function finish(s: Listening, bindings: PadBindings, now: number): RemapStep {
  const r = setButtons(bindings, s.action, s.buttons);
  return {
    state: {
      kind: 'result',
      action: s.action,
      since: now,
      buttons: r.bindings[s.action],
      cancelled: null,
      lost: r.lost,
      shared: r.shared,
    },
    bindings: r.bindings,
    changed: !sameBindings(bindings, r.bindings),
  };
}

/**
 * One frame. While listening, each bindable button newly pressed (not held on the last frame) counts as a
 * press; the D-pad and sticks are never looked at. Start counts when it is released and cancels the whole
 * listen when held for {@link CANCEL_HOLD_MS}. The listen finishes {@link FINISH_MS} after the last press,
 * and gives up with nothing bound after {@link LISTEN_TIMEOUT_MS} with no first press. A result goes back
 * to idle after {@link RESULT_MS}.
 */
export function stepRemap(
  state: RemapState,
  bindings: PadBindings,
  now: number,
  pressed: ReadonlySet<number>,
): RemapStep {
  const same: RemapStep = { state, bindings, changed: false };
  if (state.kind === 'idle') return same;
  if (state.kind === 'result') {
    return now - state.since >= RESULT_MS ? { ...same, state: IDLE } : same;
  }
  const cancel = (reason: CancelReason): RemapStep => ({
    ...same,
    state: cancelled(state, now, reason),
  });
  if (state.buttons.length === 0 && now - state.since >= LISTEN_TIMEOUT_MS)
    return cancel('timeout');

  const presses: number[] = [];
  let startAt = state.startAt;
  if (startAt !== null) {
    if (!pressed.has(START)) {
      presses.push(START);
      startAt = null;
    } else if (now - startAt >= CANCEL_HOLD_MS) return cancel('pad');
  }
  for (const i of BINDABLE_BUTTONS) {
    if (!pressed.has(i) || state.held.includes(i)) continue;
    if (i === START) startAt ??= now;
    else presses.push(i);
  }
  let buttons = state.buttons;
  for (const b of presses) buttons = press(buttons, b);
  const lastAt = presses.length ? now : state.lastAt;
  if (buttons.length > 0 && startAt === null && now - lastAt >= FINISH_MS)
    return finish({ ...state, buttons }, bindings, now);

  const held = [...pressed];
  if (presses.length === 0 && startAt === state.startAt && sameList(held, state.held)) return same;
  return { ...same, state: { ...state, held, buttons, lastAt, startAt } };
}

/**
 * Finishes a listen at once (Enter or a tap on the row): binds what has been collected, or cancels
 * when nothing has been pressed yet. Idle and a result stay as they are.
 */
export function finishRemap(state: RemapState, bindings: PadBindings, now: number): RemapStep {
  if (state.kind !== 'listening') return { state, bindings, changed: false };
  if (state.buttons.length === 0)
    return { state: cancelled(state, now, 'touch'), bindings, changed: false };
  return finish(state, bindings, now);
}

/** Ends listening because the player cancelled with the keyboard, a touch or the pad. Anything collected is discarded. Idle and result stay as they are. */
export function cancelRemap(
  state: RemapState,
  now: number,
  reason: Exclude<CancelReason, 'timeout'>,
): RemapState {
  return state.kind === 'listening' ? cancelled(state, now, reason) : state;
}

const names = (list: readonly PadAction[]): string =>
  list.map((a) => PAD_ACTION_NAMES[a]).join(' and ');

/** The line for a screen to show: what to press while listening, or what happened. Empty when idle. */
export function remapMessage(state: RemapState, family: PadFamily): string {
  if (state.kind === 'idle') return '';
  const name = PAD_ACTION_NAMES[state.action];
  if (state.kind === 'listening') return `Press buttons for ${name}, wait when done`;
  if (state.buttons === null)
    return state.cancelled === 'timeout' ? 'No button pressed' : 'Cancelled';
  let text = `${name} is now ${state.buttons.map((i) => padButtonName(i, family)).join(', ')}`;
  if (state.lost.length) text += `, taken from ${names(state.lost)}`;
  if (state.shared.length) text += `, shared with ${names(state.shared)}, which keeps it`;
  return text;
}
