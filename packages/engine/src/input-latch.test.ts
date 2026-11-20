// Tests for fast pad polling: the timer's life, the press latch, the one-tick deferral of a repeated press, the pad gate and the keyboard latch.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input, InputManager, PAD_POLL_MS } from './input';

interface FakePad {
  index: number;
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  axes: number[];
}

const makePad = (index = 0): FakePad => ({
  index,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  axes: [0, 0, 0, 0],
});

const set = (pad: FakePad, button: number, on: boolean): void => {
  pad.buttons[button] = { pressed: on, touched: on, value: on ? 1 : 0 };
};

const A = 0;
const JUMP = Input.JUMP;

let win: EventTarget;
let doc: EventTarget & { hidden: boolean };
let pads: (FakePad | null)[];
let managers: InputManager[];

function make(initial: FakePad[] = []): InputManager {
  pads = [...initial];
  const m = new InputManager(new EventTarget() as unknown as HTMLElement);
  managers.push(m);
  return m;
}

const connect = (pad: FakePad): void => {
  pads.push(pad);
  win.dispatchEvent(new Event('gamepadconnected'));
};

const disconnect = (pad: FakePad): void => {
  pads = pads.filter((p) => p !== pad);
  win.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: pad }));
};

/** Lets the fast timer run for `ms` of fake time. */
const wait = (ms: number): void => void vi.advanceTimersByTime(ms);

beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { hidden: false });
  managers = [];
  pads = [];
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { getGamepads: () => pads });
});

afterEach(() => {
  for (const m of managers) m.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the fast timer', () => {
  it('samples every PAD_POLL_MS, only while a pad is connected', () => {
    expect(PAD_POLL_MS).toBe(4);
    const m = make();
    expect(vi.getTimerCount()).toBe(0);
    const pad = makePad();
    connect(pad);
    expect(vi.getTimerCount()).toBe(1);
    disconnect(pad);
    expect(vi.getTimerCount()).toBe(0);
    expect(m.latching).toBe(true);
  });

  it('starts at once when a pad is already connected, and stops on dispose', () => {
    const m = make([makePad()]);
    expect(vi.getTimerCount()).toBe(1);
    m.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is skipped while the page is hidden', () => {
    const pad = makePad();
    const m = make([pad]);
    doc.hidden = true;
    set(pad, A, true);
    wait(8);
    set(pad, A, false);
    wait(8);
    doc.hidden = false;
    expect(m.poll() & JUMP).toBe(0);
  });

  it('never throws when getGamepads is missing or throws', () => {
    vi.stubGlobal('navigator', {});
    const m = make();
    win.dispatchEvent(new Event('gamepadconnected'));
    expect(vi.getTimerCount()).toBe(0);
    expect(m.poll()).toBe(0);
    vi.stubGlobal('navigator', {
      getGamepads: () => {
        throw new Error('no pad');
      },
    });
    m.setLatch(false);
    expect(() => m.setLatch(true)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the press latch', () => {
  it('gives a press shorter than a tick exactly one tick', () => {
    const pad = makePad();
    const m = make([pad]);
    expect(m.poll()).toBe(0);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
    expect(m.poll() & JUMP).toBe(0);
  });

  it('keeps a held button held', () => {
    const pad = makePad();
    const m = make([pad]);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    for (let i = 0; i < 4; i++) {
      expect(m.poll() & JUMP).toBe(JUMP);
      wait(16);
    }
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
  });

  it('turns two quick presses between ticks into a low tick, then a high tick', () => {
    const pad = makePad();
    const m = make([pad]);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
    // Let go and press again before the next tick, and keep it held.
    set(pad, A, false);
    wait(PAD_POLL_MS);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    expect(m.poll() & JUMP).toBe(JUMP);
    expect(m.poll() & JUMP).toBe(JUMP);
  });

  it('defers a repeated tap that is let go again, so it is still one tick', () => {
    const pad = makePad();
    const m = make([pad]);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    expect(m.poll() & JUMP).toBe(JUMP);
    expect(m.poll() & JUMP).toBe(0);
  });

  it('does not touch a release with no press after it', () => {
    const pad = makePad();
    const m = make([pad]);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
  });

  it('keeps a key or a finger that holds the same bit from being hidden by a deferral', () => {
    const pad = makePad();
    const m = make([pad]);
    win.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'KeyZ', key: 'z', repeat: false }),
    );
    set(pad, A, true);
    wait(PAD_POLL_MS);
    m.poll();
    set(pad, A, false);
    wait(PAD_POLL_MS);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
  });
});

describe('the pad gate', () => {
  it('latches nothing while a screen is listening, or until every button is up after it', () => {
    const pad = makePad();
    const m = make([pad]);
    m.setPadListening(true);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    // Listening ends with the button held: the hold-off ignores it until it is let go.
    set(pad, A, true);
    m.setPadListening(false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(JUMP);
  });
});

describe('with latching off', () => {
  it('has no timer and reads exactly what is down at the tick', () => {
    const pad = makePad();
    const m = make([pad]);
    m.setLatch(false);
    expect(vi.getTimerCount()).toBe(0);
    set(pad, A, true);
    wait(PAD_POLL_MS);
    set(pad, A, false);
    wait(PAD_POLL_MS);
    expect(m.poll() & JUMP).toBe(0);
    set(pad, A, true);
    expect(m.poll() & JUMP).toBe(JUMP);
    set(pad, A, false);
    win.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'KeyZ', key: 'z', repeat: false }),
    );
    win.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyZ', key: 'z' }));
    expect(m.poll()).toBe(0);
  });

  it('comes back on with the timer', () => {
    const m = make([makePad()]);
    m.setLatch(false);
    m.setLatch(true);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('the keyboard latch', () => {
  it('gives a key pressed and let go between ticks one tick of its bits', () => {
    const m = make();
    win.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'KeyZ', key: 'z', repeat: false }),
    );
    win.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyZ', key: 'z' }));
    expect(m.poll() & JUMP).toBe(JUMP);
    expect(m.poll() & JUMP).toBe(0);
  });

  it('leaves Pause and Confirm to their own paths', () => {
    const m = make();
    win.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'Escape', key: 'Escape', repeat: false }),
    );
    win.dispatchEvent(Object.assign(new Event('keyup'), { code: 'Escape', key: 'Escape' }));
    expect(m.poll()).toBe(0);
  });

  it('drops presses a menu left behind', () => {
    const m = make();
    win.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'KeyZ', key: 'z', repeat: false }),
    );
    win.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyZ', key: 'z' }));
    m.dropLatch();
    expect(m.poll()).toBe(0);
  });
});
