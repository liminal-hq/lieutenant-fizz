// Tests for the instance writer, fixed-step loop, input mapping and mini-notation.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { FixedStepper, InstanceWriter } from './instances';
import { keysToBits, padToBits, Input } from './input';
import { evalMini, noteHz, parseMini, type MiniEvent } from './audio';

const rects = { a: { u: 0.25, v: 0.5, uw: 0.03, vh: 0.04, w: 16, h: 32 } };

describe('InstanceWriter', () => {
  it('lays out matrix, UV and flags exactly like the Rust writer', () => {
    const w = new InstanceWriter(new Float32Array(20 * 4), rects);
    w.push(3, 4, 'a', { flip: true, em: true, act: true, tint: 0xff0000 });
    const b = (w as unknown as { buf: Float32Array }).buf;
    expect([b[0], b[5], b[3], b[7], b[10], b[15]]).toEqual([
      -1,
      2,
      expect.closeTo(0.03),
      expect.closeTo(0.04),
      1,
      1,
    ]);
    expect([b[12], b[13]]).toEqual([3, 4]);
    expect(b[18]).toBe(0xff0000);
    expect(b[19]).toBe(7);
    expect(w.n).toBe(1);
  });

  it('rotates, ignores unknown names and stops at capacity', () => {
    const w = new InstanceWriter(new Float32Array(20 * 2), rects);
    w.push(0, 0, 'nope');
    expect(w.n).toBe(0);
    w.push(0, 0, 'a', { rot: Math.PI / 2 });
    const b = (w as unknown as { buf: Float32Array }).buf;
    expect(b[0]).toBeCloseTo(0);
    expect(b[1]).toBeCloseTo(1);
    w.push(0, 0, 'a');
    w.push(0, 0, 'a');
    expect(w.n).toBe(2);
  });
});

describe('FixedStepper', () => {
  it('runs whole ticks and returns the remainder as alpha', () => {
    const s = new FixedStepper();
    let n = 0;
    const alpha = s.advance(0.05, () => n++);
    expect(n).toBe(3);
    expect(alpha).toBeCloseTo(0.05 / (1 / 60) - 3, 5);
  });

  it('caps catch-up at 0.25 s and ignores negative deltas', () => {
    const s = new FixedStepper();
    let n = 0;
    s.advance(10, () => n++);
    expect(n).toBe(15);
    n = 0;
    s.advance(-1, () => n++);
    expect(n).toBe(0);
  });
});

describe('input mapping', () => {
  it('maps Keen-style and modern layouts to the same bits', () => {
    expect(keysToBits(new Set(['ArrowLeft', 'ControlLeft', 'Space']))).toBe(
      Input.LEFT | Input.JUMP | Input.FIRE,
    );
    expect(keysToBits(new Set(['KeyD', 'KeyZ', 'KeyX', 'KeyC']))).toBe(
      Input.RIGHT | Input.JUMP | Input.POGO | Input.FIRE,
    );
    expect(keysToBits(new Set(['AltLeft', 'KeyW']))).toBe(Input.POGO | Input.UP);
  });

  it('maps a standard gamepad', () => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    buttons[0]!.pressed = true;
    buttons[7]!.pressed = true;
    buttons[9]!.pressed = true;
    const r = padToBits({
      buttons: buttons as unknown as readonly GamepadButton[],
      axes: [-0.8, 0.9],
    });
    expect(r.bits).toBe(Input.LEFT | Input.DOWN | Input.JUMP | Input.FIRE);
    expect(r.start).toBe(true);
  });
});

describe('mini-notation', () => {
  const events = (src: string, cyc = 0): MiniEvent[] => {
    const out: MiniEvent[] = [];
    evalMini(parseMini(src), 0, 1, cyc, out);
    return out;
  };

  it('splits a cycle evenly and treats ~ as a rest', () => {
    const ev = events('c4 ~ e4 g4');
    expect(ev.map((e) => e.v)).toEqual(['c4', 'e4', 'g4']);
    expect(ev[1]!.t0).toBeCloseTo(0.5);
    expect(ev[1]!.t1 - ev[1]!.t0).toBeCloseTo(0.25);
  });

  it('alternates <> per cycle, stacks with commas and repeats with *n', () => {
    expect(events('<a4 b4>', 0).map((e) => e.v)).toEqual(['a4']);
    expect(events('<a4 b4>', 1).map((e) => e.v)).toEqual(['b4']);
    expect(events('[c4,e4,g4]').map((e) => e.v)).toEqual(['c4', 'e4', 'g4']);
    expect(events('white*4')).toHaveLength(4);
    expect(events('[~ white]*2').map((e) => e.t0)).toEqual([0.25, 0.75]);
  });

  it('converts note names to Hz', () => {
    expect(noteHz('a4')).toBeCloseTo(440);
    expect(noteHz('c5')).toBeCloseTo(523.25, 1);
    expect(noteHz('f#3')).toBeCloseTo(185, 0);
    expect(noteHz('nonsense')).toBe(440);
  });
});
