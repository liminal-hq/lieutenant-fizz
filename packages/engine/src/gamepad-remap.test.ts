// Tests for the listening state machine: fresh presses only, ignored held buttons, cancelling and the timeout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD_BINDINGS } from './gamepad-bindings';
import {
  CANCEL_HOLD_MS,
  IDLE,
  LISTEN_TIMEOUT_MS,
  RESULT_MS,
  cancelRemap,
  remapMessage,
  startListening,
  stepRemap,
  type RemapState,
} from './gamepad-remap';

const none = new Set<number>();
const down = (...i: number[]): Set<number> => new Set(i);
const B = DEFAULT_PAD_BINDINGS;

describe('listening', () => {
  it('stays idle until asked', () => {
    expect(stepRemap(IDLE, B, 0, down(0)).state).toBe(IDLE);
  });

  it('binds the next button pressed', () => {
    const s = startListening('jump', 0, none);
    const r = stepRemap(s, B, 100, down(4));
    expect(r.changed).toBe(true);
    expect(r.bindings.jump).toEqual([4]);
    expect(r.state).toMatchObject({ kind: 'result', action: 'jump', button: 4, cancelled: null });
  });

  it('waits while nothing is pressed', () => {
    const s = startListening('jump', 0, none);
    const r = stepRemap(s, B, 500, none);
    expect(r.state.kind).toBe('listening');
    expect(r.changed).toBe(false);
  });

  it('ignores a button held when listening began until it is released and pressed again', () => {
    let s: RemapState = startListening('jump', 0, down(0));
    expect(stepRemap(s, B, 10, down(0)).state.kind).toBe('listening');
    s = stepRemap(s, B, 20, down(0)).state;
    // Released: no longer ignored. Pressed again: it is fresh.
    s = stepRemap(s, B, 30, none).state;
    const r = stepRemap(s, B, 40, down(0));
    expect(r.state).toMatchObject({ kind: 'result', button: 0 });
  });

  it('binds a fresh button even while another stays held', () => {
    const s = startListening('fire', 0, down(0));
    const r = stepRemap(s, B, 10, down(0, 5));
    expect(r.state).toMatchObject({ kind: 'result', button: 5 });
  });

  it('ignores the D-pad and everything not bindable', () => {
    const s = startListening('jump', 0, none);
    for (const i of [10, 11, 12, 13, 14, 15, 16])
      expect(stepRemap(s, B, 10, down(i)).state.kind).toBe('listening');
  });

  it('takes the lowest button when two arrive in one frame', () => {
    const r = stepRemap(startListening('jump', 0, none), B, 5, down(6, 3));
    expect(r.state).toMatchObject({ button: 3 });
  });

  it('binds Start when it is released, and reports the swap with Pause', () => {
    const r = stepRemap(startListening('jump', 0, none), B, 5, down(9));
    expect(r.state.kind).toBe('listening');
    const done = stepRemap(r.state, B, 80, none);
    expect(done.state).toMatchObject({ kind: 'result', button: 9, from: 'pause', swapped: true });
    expect(done.bindings.pause).toEqual([0]);
  });
});

describe('cancelling', () => {
  it('cancels from the keyboard or a touch', () => {
    const s = startListening('pogo', 0, none);
    expect(cancelRemap(s, 50, 'key')).toMatchObject({
      kind: 'result',
      button: null,
      cancelled: 'key',
    });
    expect(cancelRemap(s, 50, 'touch')).toMatchObject({ cancelled: 'touch' });
  });

  it('leaves idle and a result alone', () => {
    expect(cancelRemap(IDLE, 0, 'key')).toBe(IDLE);
    const res = stepRemap(startListening('jump', 0, none), B, 5, down(4)).state;
    expect(cancelRemap(res, 9, 'key')).toBe(res);
  });

  it('cancels when Start is held for a second, and binds nothing', () => {
    let s: RemapState = startListening('jump', 0, none);
    s = stepRemap(s, B, 100, down(9)).state;
    expect(stepRemap(s, B, 100 + CANCEL_HOLD_MS - 1, down(9)).state.kind).toBe('listening');
    const r = stepRemap(s, B, 100 + CANCEL_HOLD_MS, down(9));
    expect(r.state).toMatchObject({ kind: 'result', button: null, cancelled: 'pad' });
    expect(r.changed).toBe(false);
  });

  it('does not take a Start that was already down as listening began for a press', () => {
    let s: RemapState = startListening('jump', 0, down(9));
    s = stepRemap(s, B, 1500, down(9)).state;
    expect(s.kind).toBe('listening');
  });

  it('gives up after eight seconds with nothing pressed', () => {
    const s = startListening('jump', 1000, none);
    expect(stepRemap(s, B, 1000 + LISTEN_TIMEOUT_MS - 1, none).state.kind).toBe('listening');
    const r = stepRemap(s, B, 1000 + LISTEN_TIMEOUT_MS, none);
    expect(r.state).toMatchObject({ kind: 'result', button: null, cancelled: 'timeout' });
    expect(r.changed).toBe(false);
  });
});

describe('the result', () => {
  it('returns to idle after a moment', () => {
    const res = stepRemap(startListening('jump', 0, none), B, 5, down(4)).state;
    expect(stepRemap(res, B, 5 + RESULT_MS - 1, none).state).toBe(res);
    expect(stepRemap(res, B, 5 + RESULT_MS, none).state).toBe(IDLE);
  });
});

describe('remapMessage', () => {
  it('says what to press, and what happened', () => {
    const s = startListening('fire', 0, none);
    expect(remapMessage(IDLE, 'xbox')).toBe('');
    expect(remapMessage(s, 'xbox')).toBe('Press a button for Fizz');
    expect(remapMessage(stepRemap(s, B, 1, down(4)).state, 'xbox')).toBe('Fizz is now LB');
    expect(remapMessage(stepRemap(s, B, 1, down(4)).state, 'playstation')).toBe('Fizz is now L1');
    expect(remapMessage(cancelRemap(s, 1, 'key'), 'xbox')).toBe('Cancelled');
    expect(remapMessage(stepRemap(s, B, LISTEN_TIMEOUT_MS, none).state, 'xbox')).toBe(
      'No button pressed',
    );
    const taken = stepRemap(startListening('jump', 0, none), B, 1, down(7)).state;
    expect(remapMessage(taken, 'xbox')).toBe('Jump is now RT, taken from Fizz');
    const swap = stepRemap(
      stepRemap(startListening('jump', 0, none), B, 1, down(9)).state,
      B,
      2,
      none,
    ).state;
    expect(remapMessage(swap, 'xbox')).toBe('Jump is now Start, and Pause took its old button');
  });
});
