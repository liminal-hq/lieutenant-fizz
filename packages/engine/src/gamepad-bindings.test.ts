// Tests for the gamepad bindings: the defaults, parsing, conflicts, reset and storage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  BINDABLE_BUTTONS,
  DEFAULT_PAD_BINDINGS,
  PAD_ACTIONS,
  PAD_BINDINGS_KEY,
  bindButton,
  buttonsToBits,
  isDefaultPadBindings,
  parsePadBindings,
  readPadBindings,
  resetPadBindings,
  serialisePadBindings,
  writePadBindings,
  type PadBindings,
} from './gamepad-bindings';
import { Input, padToBits } from './input';

const pad = (down: number[]): Pick<Gamepad, 'buttons' | 'axes'> => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: down.includes(i),
    touched: false,
    value: 0,
  })),
  axes: [0, 0, 0, 0],
});

/** What `padToBits` did before the buttons could be rebound. */
function legacy(down: number[]): { bits: number; start: boolean } {
  const b = (i: number): boolean => down.includes(i);
  let bits = 0;
  if (b(14)) bits |= Input.LEFT;
  if (b(15)) bits |= Input.RIGHT;
  if (b(12)) bits |= Input.UP;
  if (b(13)) bits |= Input.DOWN;
  if (b(0)) bits |= Input.JUMP;
  if (b(1) || b(3)) bits |= Input.POGO;
  if (b(2) || b(7)) bits |= Input.FIRE;
  return { bits, start: b(9) };
}

describe('the default bindings', () => {
  it('are the standard mapping the game has always used', () => {
    expect(DEFAULT_PAD_BINDINGS).toEqual({ jump: [0], pogo: [1, 3], fire: [2, 7], pause: [9] });
  });

  it('give the same bits as the hardcoded mapping for every button on its own and in pairs', () => {
    const all = Array.from({ length: 17 }, (_, i) => i);
    for (const a of all) {
      expect(padToBits(pad([a]))).toEqual(legacy([a]));
      for (const b of all)
        expect(padToBits(pad([a, b]), DEFAULT_PAD_BINDINGS)).toEqual(legacy([a, b]));
    }
  });

  it('give each button to at most one action, all of them bindable', () => {
    const all = PAD_ACTIONS.flatMap((a) => DEFAULT_PAD_BINDINGS[a]);
    expect(new Set(all).size).toBe(all.length);
    for (const i of all) expect(BINDABLE_BUTTONS).toContain(i);
  });
});

describe('parsePadBindings', () => {
  it('reads what serialise wrote', () => {
    const b: PadBindings = { jump: [2], pogo: [0, 4], fire: [5], pause: [8] };
    expect(parsePadBindings(serialisePadBindings(b))).toEqual(b);
  });

  it('gives the defaults for nothing, bad JSON, the wrong shape or an unknown version', () => {
    for (const j of [null, '', '{', '[]', '"x"', '{"v":2,"jump":[1]}', '{"jump":[1]}'])
      expect(parsePadBindings(j)).toEqual(DEFAULT_PAD_BINDINGS);
  });

  it('defaults a field that is missing or invalid and keeps the others', () => {
    const j = (o: unknown): string => JSON.stringify({ v: 1, ...(o as object) });
    expect(parsePadBindings(j({ fire: [5] }))).toEqual({ ...DEFAULT_PAD_BINDINGS, fire: [5] });
    for (const bad of [[], [99], [-1], [1.5], ['1'], 3, 'a', null, [12], [10]])
      expect(parsePadBindings(j({ jump: bad, fire: [5] }))).toEqual({
        ...DEFAULT_PAD_BINDINGS,
        fire: [5],
      });
  });

  it('drops a duplicate within an action', () => {
    expect(parsePadBindings('{"v":1,"pogo":[1,1,3]}').pogo).toEqual([1, 3]);
  });

  it('gives every default when two actions share a button', () => {
    expect(parsePadBindings('{"v":1,"jump":[1],"pogo":[1,3]}')).toEqual(DEFAULT_PAD_BINDINGS);
    // A field left at its default can collide with a stored one too.
    expect(parsePadBindings('{"v":1,"jump":[2]}')).toEqual(DEFAULT_PAD_BINDINGS);
  });

  it('ignores unknown fields', () => {
    expect(parsePadBindings('{"v":1,"extra":1}')).toEqual(DEFAULT_PAD_BINDINGS);
  });

  it('never returns the shared default arrays', () => {
    const b = parsePadBindings(null);
    expect(b.pogo).not.toBe(DEFAULT_PAD_BINDINGS.pogo);
  });
});

describe('bindButton', () => {
  it('replaces an action with the one button when it is free', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 4);
    expect(r.bindings).toEqual({ ...DEFAULT_PAD_BINDINGS, jump: [4] });
    expect(r.from).toBeNull();
    expect(r.swapped).toBe(false);
  });

  it('swaps when the button belongs to an action with only that button', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 9);
    expect(r.bindings).toEqual({ jump: [9], pogo: [1, 3], fire: [2, 7], pause: [0] });
    expect(r.from).toBe('pause');
    expect(r.swapped).toBe(true);
  });

  it('takes a button from an action that has others left, without a swap', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 7);
    expect(r.bindings).toEqual({ jump: [7], pogo: [1, 3], fire: [2], pause: [9] });
    expect(r.from).toBe('fire');
    expect(r.swapped).toBe(false);
  });

  it('gives a swapped action every old button of the one that moved', () => {
    const r = bindButton({ ...DEFAULT_PAD_BINDINGS, jump: [0, 4] }, 'pause', 0);
    expect(r.bindings.jump).toEqual([4]);
    const s = bindButton(DEFAULT_PAD_BINDINGS, 'pogo', 9);
    expect(s.bindings.pause).toEqual([1, 3]);
    expect(s.bindings.pogo).toEqual([9]);
  });

  it('never leaves an action empty or a button on two actions', () => {
    let b: PadBindings = DEFAULT_PAD_BINDINGS;
    for (const a of PAD_ACTIONS)
      for (const i of BINDABLE_BUTTONS) {
        b = bindButton(b, a, i).bindings;
        const all = PAD_ACTIONS.flatMap((x) => b[x]);
        expect(new Set(all).size).toBe(all.length);
        for (const x of PAD_ACTIONS) expect(b[x].length).toBeGreaterThan(0);
        expect(b[a]).toEqual([i]);
      }
  });

  it('refuses a button that cannot be bound', () => {
    for (const i of [10, 12, 14, 16, -1, 2.5]) {
      const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', i);
      expect(r.bindings).toBe(DEFAULT_PAD_BINDINGS);
    }
  });
});

describe('buttonsToBits', () => {
  it('follows the bindings', () => {
    const b: PadBindings = { jump: [2], pogo: [0], fire: [5], pause: [8] };
    expect(buttonsToBits(b, pad([2]))).toEqual({
      jump: true,
      pogo: false,
      fire: false,
      pause: false,
    });
    expect(buttonsToBits(b, pad([0, 5, 8]))).toEqual({
      jump: false,
      pogo: true,
      fire: true,
      pause: true,
    });
  });

  it('reaches the sim through padToBits, leaving the D-pad where it is', () => {
    const b: PadBindings = { jump: [2], pogo: [0], fire: [5], pause: [8] };
    expect(padToBits(pad([2]), b)).toEqual({ bits: Input.JUMP, start: false });
    expect(padToBits(pad([0]), b).bits).toBe(Input.POGO);
    expect(padToBits(pad([5]), b).bits).toBe(Input.FIRE);
    expect(padToBits(pad([8]), b).start).toBe(true);
    // The old buttons no longer act.
    expect(padToBits(pad([9, 1, 3, 7]), b)).toEqual({ bits: 0, start: false });
    expect(padToBits(pad([14, 12]), b).bits).toBe(Input.LEFT | Input.UP);
  });
});

describe('reset and storage', () => {
  it('puts every action back', () => {
    expect(resetPadBindings()).toEqual(DEFAULT_PAD_BINDINGS);
    expect(isDefaultPadBindings(resetPadBindings())).toBe(true);
    expect(isDefaultPadBindings(bindButton(DEFAULT_PAD_BINDINGS, 'jump', 4).bindings)).toBe(false);
  });

  it('writes and reads through a store under its own key', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const b = bindButton(DEFAULT_PAD_BINDINGS, 'fire', 4).bindings;
    expect(writePadBindings(store, b)).toBe(true);
    expect([...data.keys()]).toEqual([PAD_BINDINGS_KEY]);
    expect(PAD_BINDINGS_KEY).toBe('lf-pad-bindings-v1');
    expect(readPadBindings(store)).toEqual(b);
  });

  it('survives missing, empty and refusing storage', () => {
    expect(readPadBindings(null)).toEqual(DEFAULT_PAD_BINDINGS);
    expect(readPadBindings({ getItem: () => null })).toEqual(DEFAULT_PAD_BINDINGS);
    expect(
      readPadBindings({
        getItem: () => {
          throw new Error('no');
        },
      }),
    ).toEqual(DEFAULT_PAD_BINDINGS);
    expect(writePadBindings(null, DEFAULT_PAD_BINDINGS)).toBe(false);
    expect(
      writePadBindings(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        DEFAULT_PAD_BINDINGS,
      ),
    ).toBe(false);
  });
});
