// Tests for the hint-device switch (keyboard, gamepad or touch), the key, pad and touch mappings and how they combine.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Input, inputBits, keysToBits, nextDevice, padToBits, touchToBits } from './input';
import { NO_TOUCH } from './touch';

describe('nextDevice', () => {
  it('switches to the keyboard on a key press', () => {
    expect(nextDevice('gamepad', 'key')).toBe('keyboard');
    expect(nextDevice('keyboard', 'key')).toBe('keyboard');
  });

  it('switches to the gamepad on pad input and when a pad connects', () => {
    expect(nextDevice('keyboard', 'pad-input')).toBe('gamepad');
    expect(nextDevice('keyboard', 'pad-connected')).toBe('gamepad');
    expect(nextDevice('gamepad', 'pad-connected')).toBe('gamepad');
  });

  it('goes back to the keyboard when the last pad is unplugged', () => {
    expect(nextDevice('gamepad', 'pad-disconnected', 0)).toBe('keyboard');
    expect(nextDevice('gamepad', 'pad-disconnected', 1)).toBe('gamepad');
    expect(nextDevice('keyboard', 'pad-disconnected', 1)).toBe('keyboard');
  });

  it('switches to touch on a touch, and back on any other input', () => {
    expect(nextDevice('keyboard', 'touch')).toBe('touch');
    expect(nextDevice('gamepad', 'touch')).toBe('touch');
    expect(nextDevice('touch', 'key')).toBe('keyboard');
    expect(nextDevice('touch', 'pad-input')).toBe('gamepad');
    expect(nextDevice('touch', 'pad-connected')).toBe('gamepad');
  });

  it('leaves touch alone when a pad is unplugged', () => {
    expect(nextDevice('touch', 'pad-disconnected', 0)).toBe('touch');
    expect(nextDevice('touch', 'pad-disconnected', 1)).toBe('touch');
  });

  it('follows the last input used through a sequence', () => {
    let d = nextDevice('keyboard', 'pad-connected');
    expect(d).toBe('gamepad');
    d = nextDevice(d, 'key');
    expect(d).toBe('keyboard');
    d = nextDevice(d, 'pad-input');
    expect(d).toBe('gamepad');
    d = nextDevice(d, 'pad-disconnected', 0);
    expect(d).toBe('keyboard');
  });
});

describe('input mappings', () => {
  it('maps both keyboard layouts to the same bits', () => {
    expect(keysToBits(new Set(['ControlLeft']))).toBe(Input.JUMP);
    expect(keysToBits(new Set(['KeyZ']))).toBe(Input.JUMP);
    expect(keysToBits(new Set(['AltLeft']))).toBe(Input.POGO);
    expect(keysToBits(new Set(['KeyX']))).toBe(Input.POGO);
    expect(keysToBits(new Set(['Space']))).toBe(Input.FIRE);
    expect(keysToBits(new Set(['KeyC']))).toBe(Input.FIRE);
    expect(keysToBits(new Set(['ArrowLeft', 'KeyW']))).toBe(Input.LEFT | Input.UP);
  });

  it('maps the standard gamepad buttons and reports Start', () => {
    const pad = (
      pressed: number[],
      axes: number[] = [0, 0],
    ): Pick<Gamepad, 'buttons' | 'axes'> => ({
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) as never,
      axes,
    });
    expect(padToBits(pad([0])).bits).toBe(Input.JUMP);
    expect(padToBits(pad([1])).bits).toBe(Input.POGO);
    expect(padToBits(pad([2])).bits).toBe(Input.FIRE);
    expect(padToBits(pad([14], [0, 0])).bits).toBe(Input.LEFT);
    expect(padToBits(pad([], [0.9, 0])).bits).toBe(Input.RIGHT);
    expect(padToBits(pad([9])).start).toBe(true);
    expect(padToBits(pad([])).bits).toBe(0);
  });
});

describe('touch and the combined bits', () => {
  it('maps held touch controls to the same bits as the keys', () => {
    expect(touchToBits(NO_TOUCH)).toBe(0);
    expect(touchToBits({ ...NO_TOUCH, left: true, up: true })).toBe(Input.LEFT | Input.UP);
    expect(touchToBits({ ...NO_TOUCH, right: true, down: true })).toBe(Input.RIGHT | Input.DOWN);
    expect(touchToBits({ ...NO_TOUCH, jump: true, pogo: true, fire: true })).toBe(
      Input.JUMP | Input.POGO | Input.FIRE,
    );
  });

  it('adds touch only while touch is enabled', () => {
    const src = { keys: Input.LEFT, pad: Input.FIRE, touch: Input.JUMP };
    expect(inputBits(src, { touchEnabled: true, blocked: false })).toBe(
      Input.LEFT | Input.FIRE | Input.JUMP,
    );
    expect(inputBits(src, { touchEnabled: false, blocked: false })).toBe(Input.LEFT | Input.FIRE);
  });

  it('silences every source when blocked', () => {
    const src = { keys: Input.LEFT, pad: Input.FIRE, touch: Input.JUMP };
    expect(inputBits(src, { touchEnabled: true, blocked: true })).toBe(0);
  });
});
