// Tests for the listening state machine: collected presses, toggles, the finish timer, cancels and the timeout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD_BINDINGS, type PadBindings } from './gamepad-bindings';
import {
  CANCEL_HOLD_MS,
  FINISH_MS,
  IDLE,
  LISTEN_TIMEOUT_MS,
  RESULT_MS,
  cancelRemap,
  finishRemap,
  remapMessage,
  startListening,
  stepRemap,
  type RemapState,
  type RemapStep,
} from './gamepad-remap';

const none = new Set<number>();
const down = (...i: number[]): Set<number> => new Set(i);
const B = DEFAULT_PAD_BINDINGS;

/** Steps through a script of [time, buttons down] and returns the last step. */
function run(
  action: 'jump' | 'pogo' | 'fire' | 'pause',
  script: [number, Set<number>][],
  start: Set<number> = none,
  bindings: PadBindings = B,
): RemapStep {
  let state: RemapState = startListening(action, 0, start);
  let step: RemapStep = { state, bindings, changed: false };
  for (const [t, pressed] of script) {
    step = stepRemap(state, bindings, t, pressed);
    state = step.state;
  }
  return step;
}

const buttonsOf = (s: RemapState): readonly number[] | null | undefined =>
  s.kind === 'listening' || s.kind === 'result' ? s.buttons : undefined;

describe('collecting presses', () => {
  it('stays idle until asked', () => {
    expect(stepRemap(IDLE, B, 0, down(0)).state).toBe(IDLE);
  });

  it('collects the first press without binding yet', () => {
    const r = run('jump', [[100, down(4)]]);
    expect(r.state).toMatchObject({ kind: 'listening', buttons: [4] });
    expect(r.changed).toBe(false);
    expect(r.bindings).toBe(B);
  });

  it('finishes 1.5 s after the last press, replacing the action’s buttons', () => {
    const r = run('jump', [
      [100, down(4)],
      [150, none],
      [100 + FINISH_MS - 1, none],
    ]);
    expect(r.state.kind).toBe('listening');
    const done = run('jump', [
      [100, down(4)],
      [150, none],
      [100 + FINISH_MS, none],
    ]);
    expect(done.state).toMatchObject({ kind: 'result', buttons: [4], cancelled: null });
    expect(done.changed).toBe(true);
    expect(done.bindings.jump).toEqual([4]);
  });

  it('adds each further fresh press, and every press restarts the timer', () => {
    const r = run('pogo', [
      [100, down(4)],
      [150, none],
      [1000, down(5)],
      [1050, none],
      [1000 + FINISH_MS - 1, none],
    ]);
    expect(r.state).toMatchObject({ kind: 'listening', buttons: [4, 5] });
    const done = run('pogo', [
      [100, down(4)],
      [150, none],
      [1000, down(5)],
      [1050, none],
      [1000 + FINISH_MS, none],
    ]);
    expect(done.bindings.pogo).toEqual([4, 5]);
  });

  it('takes two buttons pressed on one frame', () => {
    const r = run('pogo', [[10, down(1, 3)]]);
    expect(buttonsOf(r.state)).toEqual([1, 3]);
  });

  it('can reproduce the default Pogo and Fizz by pressing both buttons', () => {
    const custom: PadBindings = { ...B, pogo: [4], fire: [5] };
    const pogo = run(
      'pogo',
      [
        [10, down(1)],
        [20, none],
        [30, down(3)],
        [30 + FINISH_MS, none],
      ],
      none,
      custom,
    );
    expect(pogo.bindings.pogo).toEqual([1, 3]);
    const fire = run(
      'fire',
      [
        [10, down(2)],
        [20, none],
        [30, down(7)],
        [30 + FINISH_MS, none],
      ],
      none,
      custom,
    );
    expect(fire.bindings.fire).toEqual([2, 7]);
  });

  it('toggles a collected button off, but never the last one', () => {
    const toggled = run('pogo', [
      [10, down(4)],
      [20, none],
      [30, down(5)],
      [40, none],
      [50, down(4)],
    ]);
    expect(buttonsOf(toggled.state)).toEqual([5]);
    const last = run('pogo', [
      [10, down(4)],
      [20, none],
      [30, down(4)],
    ]);
    expect(buttonsOf(last.state)).toEqual([4]);
  });

  it('does not count a held button again until it is released and pressed again', () => {
    const r = run('pogo', [
      [10, down(4)],
      [20, down(4)],
      [30, down(4)],
    ]);
    expect(buttonsOf(r.state)).toEqual([4]);
  });

  it('ignores a button held when listening began until it is released and pressed again', () => {
    const r = run(
      'jump',
      [
        [10, down(4)],
        [20, down(4)],
      ],
      down(4),
    );
    expect(buttonsOf(r.state)).toEqual([]);
    const again = run(
      'jump',
      [
        [10, down(4)],
        [20, none],
        [30, down(4)],
      ],
      down(4),
    );
    expect(buttonsOf(again.state)).toEqual([4]);
  });

  it('ignores the D-pad and everything not bindable', () => {
    for (const i of [10, 11, 12, 13, 14, 15, 16])
      expect(buttonsOf(run('jump', [[10, down(i)]]).state)).toEqual([]);
  });

  it('returns the same state when nothing changed', () => {
    const s = startListening('jump', 0, down(4));
    expect(stepRemap(s, B, 10, down(4)).state).toBe(s);
  });
});

describe('Start', () => {
  it('counts as a press when released short, and so can be collected', () => {
    const r = run('jump', [
      [10, down(9)],
      [80, none],
    ]);
    expect(buttonsOf(r.state)).toEqual([9]);
  });

  it('waits to finish while it is held', () => {
    const r = run('jump', [
      [10, down(4)],
      [20, none],
      [1400, down(9)],
      [1600, down(9)],
    ]);
    expect(r.state.kind).toBe('listening');
  });

  it('cancels the whole listen when held for a second', () => {
    const r = run('jump', [
      [10, down(4)],
      [20, none],
      [100, down(9)],
      [100 + CANCEL_HOLD_MS - 1, down(9)],
    ]);
    expect(r.state.kind).toBe('listening');
    const c = run('jump', [
      [10, down(4)],
      [20, none],
      [100, down(9)],
      [100 + CANCEL_HOLD_MS, down(9)],
    ]);
    expect(c.state).toMatchObject({ kind: 'result', buttons: null, cancelled: 'pad' });
    expect(c.changed).toBe(false);
    expect(c.bindings).toBe(B);
  });

  it('is not taken as a press when it was down as listening began', () => {
    const r = run('jump', [[1500, down(9)]], down(9));
    expect(r.state.kind).toBe('listening');
  });
});

describe('conflicts', () => {
  it('takes a button from an action that has others left', () => {
    const r = run('jump', [
      [10, down(7)],
      [10 + FINISH_MS, none],
    ]);
    expect(r.bindings).toEqual({ ...B, jump: [7], fire: [2] });
    expect(r.state).toMatchObject({ lost: ['fire'], shared: [] });
  });

  it('shares a button with an action that would be left with none', () => {
    const r = run('jump', [
      [10, down(9)],
      [20, none],
      [20 + FINISH_MS, none],
    ]);
    expect(r.bindings).toEqual({ ...B, jump: [9] });
    expect(r.state).toMatchObject({ lost: [], shared: ['pause'] });
  });
});

describe('finishing and cancelling', () => {
  it('finishes at once on Enter or a tap, binding what was collected', () => {
    const s = run('pogo', [
      [10, down(4)],
      [20, none],
      [30, down(5)],
    ]).state;
    const r = finishRemap(s, B, 100);
    expect(r.state).toMatchObject({ kind: 'result', buttons: [4, 5] });
    expect(r.bindings.pogo).toEqual([4, 5]);
    expect(r.changed).toBe(true);
  });

  it('cancels when Enter or a tap comes before any press', () => {
    const r = finishRemap(startListening('pogo', 0, none), B, 50);
    expect(r.state).toMatchObject({ kind: 'result', buttons: null, cancelled: 'touch' });
    expect(r.changed).toBe(false);
    expect(finishRemap(IDLE, B, 0).state).toBe(IDLE);
  });

  it('reports no change when the buttons are the ones it had', () => {
    const r = run('pogo', [
      [10, down(1, 3)],
      [10 + FINISH_MS, none],
    ]);
    expect(r.state.kind).toBe('result');
    expect(r.changed).toBe(false);
  });

  it('discards what was collected on a cancel from the keyboard or a touch', () => {
    const s = run('pogo', [[10, down(4)]]).state;
    const c = cancelRemap(s, 50, 'key');
    expect(c).toMatchObject({ kind: 'result', buttons: null, cancelled: 'key' });
    expect(cancelRemap(s, 50, 'touch')).toMatchObject({ cancelled: 'touch' });
  });

  it('leaves idle and a result alone', () => {
    expect(cancelRemap(IDLE, 0, 'key')).toBe(IDLE);
    const res = finishRemap(run('jump', [[10, down(4)]]).state, B, 20).state;
    expect(cancelRemap(res, 30, 'key')).toBe(res);
  });

  it('gives up after eight seconds with no first press, but not once a button is collected', () => {
    const s = startListening('jump', 1000, none);
    expect(stepRemap(s, B, 1000 + LISTEN_TIMEOUT_MS - 1, none).state.kind).toBe('listening');
    const r = stepRemap(s, B, 1000 + LISTEN_TIMEOUT_MS, none);
    expect(r.state).toMatchObject({ kind: 'result', buttons: null, cancelled: 'timeout' });
    expect(r.changed).toBe(false);
    const late = run('jump', [[LISTEN_TIMEOUT_MS - 10, down(4)]]);
    expect(late.state.kind).toBe('listening');
  });
});

describe('the result', () => {
  it('returns to idle after a moment', () => {
    const res = finishRemap(run('jump', [[10, down(4)]]).state, B, 20).state;
    expect(stepRemap(res, B, 20 + RESULT_MS - 1, none).state).toBe(res);
    expect(stepRemap(res, B, 20 + RESULT_MS, none).state).toBe(IDLE);
  });
});

describe('remapMessage', () => {
  it('says what to press, and what happened', () => {
    const s = startListening('pogo', 0, none);
    expect(remapMessage(IDLE, 'xbox')).toBe('');
    expect(remapMessage(s, 'xbox')).toBe('Press buttons for Pogo, wait when done');
    const done = (script: [number, Set<number>][]): RemapState =>
      stepRemap(run('pogo', script).state, B, 5000, none).state;
    const two = done([
      [10, down(1)],
      [20, none],
      [30, down(3)],
    ]);
    expect(remapMessage(two, 'xbox')).toBe('Pogo is now B, Y');
    expect(remapMessage(two, 'playstation')).toBe('Pogo is now Circle, Triangle');
    expect(remapMessage(cancelRemap(s, 1, 'key'), 'xbox')).toBe('Cancelled');
    expect(remapMessage(stepRemap(s, B, LISTEN_TIMEOUT_MS, none).state, 'xbox')).toBe(
      'No button pressed',
    );
    const taken = done([[10, down(7)]]);
    expect(remapMessage(taken, 'xbox')).toBe('Pogo is now RT, taken from Fizz');
    const shared = done([
      [10, down(9)],
      [20, none],
    ]);
    expect(remapMessage(shared, 'xbox')).toBe(
      'Pogo is now Start, shared with Pause, which keeps it',
    );
  });
});
