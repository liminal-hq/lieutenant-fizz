// Tests for how the on-screen controls drive the launcher's menu.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { REPEAT_DELAY_MS, REPEAT_INTERVAL_MS } from '@lieutenant-fizz/engine/repeat';
import { TouchMenuInput } from './touch';

const none = { left: false, right: false, up: false, down: false, jump: false, pogo: false };

describe('the on-screen controls driving the menu', () => {
  it('moves the highlight with the D-pad: a press fires at once and a held one repeats', () => {
    const m = new TouchMenuInput();
    expect(m.update({ ...none, down: true }, 0, false)).toEqual([{ kind: 'step', dir: 1 }]);
    expect(m.update({ ...none, down: true }, REPEAT_DELAY_MS - 1, false)).toEqual([]);
    expect(m.update({ ...none, down: true }, REPEAT_DELAY_MS, false)).toEqual([
      { kind: 'step', dir: 1 },
    ]);
    expect(m.update({ ...none, down: true }, REPEAT_DELAY_MS + REPEAT_INTERVAL_MS, false)).toEqual([
      { kind: 'step', dir: 1 },
    ]);
    expect(m.update(none, 1000, false)).toEqual([]);
    expect(m.update({ ...none, up: true }, 1100, false)).toEqual([{ kind: 'step', dir: -1 }]);
  });

  it('changes stop with left and right', () => {
    const m = new TouchMenuInput();
    expect(m.update({ ...none, left: true }, 0, false)).toEqual([{ kind: 'stop', dir: -1 }]);
    expect(m.update(none, 100, false)).toEqual([]);
    expect(m.update({ ...none, right: true }, 200, false)).toEqual([{ kind: 'stop', dir: 1 }]);
  });

  it('chooses once for each press of Select, however long it is held', () => {
    const m = new TouchMenuInput();
    expect(m.update({ ...none, jump: true }, 0, false)).toEqual([{ kind: 'select' }]);
    expect(m.update({ ...none, jump: true }, 100, false)).toEqual([]);
    expect(m.update(none, 200, false)).toEqual([]);
    expect(m.update({ ...none, jump: true }, 300, false)).toEqual([{ kind: 'select' }]);
  });

  it('goes back on Back only where there is a screen to go back from', () => {
    const m = new TouchMenuInput();
    expect(m.update({ ...none, pogo: true }, 0, false)).toEqual([]);
    expect(m.update(none, 50, true)).toEqual([]);
    expect(m.update({ ...none, pogo: true }, 100, true)).toEqual([{ kind: 'back' }]);
    expect(m.update({ ...none, pogo: true }, 150, true)).toEqual([]);
  });

  it('does not count a Back that was already held when a screen opened as a new press on that screen', () => {
    const m = new TouchMenuInput();
    // Held while there is nothing to go back from, then the screen changes with the finger still down.
    expect(m.update({ ...none, pogo: true }, 0, false)).toEqual([]);
    expect(m.update({ ...none, pogo: true }, 100, true)).toEqual([]);
  });
});
