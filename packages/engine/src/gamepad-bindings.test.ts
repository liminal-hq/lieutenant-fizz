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
  setButtons,
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

  it('keeps a button two actions share', () => {
    expect(parsePadBindings('{"v":1,"jump":[1],"pogo":[1,3]}')).toEqual({
      ...DEFAULT_PAD_BINDINGS,
      jump: [1],
    });
    expect(parsePadBindings('{"v":1,"jump":[2]}').jump).toEqual([2]);
  });

  it('ignores unknown fields', () => {
    expect(parsePadBindings('{"v":1,"extra":1}')).toEqual(DEFAULT_PAD_BINDINGS);
  });

  it('never returns the shared default arrays', () => {
    const b = parsePadBindings(null);
    expect(b.pogo).not.toBe(DEFAULT_PAD_BINDINGS.pogo);
  });
});

describe('setButtons and bindButton', () => {
  it('replaces an action with the buttons when they are free', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 4);
    expect(r.bindings).toEqual({ ...DEFAULT_PAD_BINDINGS, jump: [4] });
    expect(r.lost).toEqual([]);
    expect(r.shared).toEqual([]);
  });

  it('gives an action several buttons, in the order given, with duplicates collapsed', () => {
    const r = setButtons(DEFAULT_PAD_BINDINGS, 'jump', [4, 5, 4]);
    expect(r.bindings.jump).toEqual([4, 5]);
  });

  it('takes a button from an action that has others left', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 7);
    expect(r.bindings).toEqual({ jump: [7], pogo: [1, 3], fire: [2], pause: [9] });
    expect(r.lost).toEqual(['fire']);
    expect(r.shared).toEqual([]);
  });

  it('shares a button with an action that would be left with none', () => {
    const r = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 9);
    expect(r.bindings).toEqual({ jump: [9], pogo: [1, 3], fire: [2, 7], pause: [9] });
    expect(r.lost).toEqual([]);
    expect(r.shared).toEqual(['pause']);
  });

  it('lets an action keep what it would otherwise lose together', () => {
    const r = setButtons(DEFAULT_PAD_BINDINGS, 'jump', [2, 7]);
    expect(r.bindings.fire).toEqual([2, 7]);
    expect(r.shared).toEqual(['fire']);
    const part = setButtons(DEFAULT_PAD_BINDINGS, 'jump', [2, 5]);
    expect(part.bindings.fire).toEqual([7]);
    expect(part.lost).toEqual(['fire']);
  });

  it('reproduces the defaults by setting both buttons', () => {
    const custom = setButtons(DEFAULT_PAD_BINDINGS, 'pogo', [4]).bindings;
    expect(setButtons(custom, 'pogo', [1, 3]).bindings).toEqual(DEFAULT_PAD_BINDINGS);
  });

  it('never leaves an action empty', () => {
    let b: PadBindings = DEFAULT_PAD_BINDINGS;
    for (const a of PAD_ACTIONS)
      for (const i of BINDABLE_BUTTONS) {
        b = setButtons(b, a, [i, (i + 3) % 10]).bindings;
        for (const x of PAD_ACTIONS) expect(b[x].length).toBeGreaterThan(0);
        expect(b[a]).toEqual([i, (i + 3) % 10]);
      }
  });

  it('refuses buttons that cannot be bound', () => {
    for (const i of [10, 12, 14, 16, -1, 2.5]) {
      expect(bindButton(DEFAULT_PAD_BINDINGS, 'jump', i).bindings).toBe(DEFAULT_PAD_BINDINGS);
    }
    expect(setButtons(DEFAULT_PAD_BINDINGS, 'jump', []).bindings).toBe(DEFAULT_PAD_BINDINGS);
    expect(setButtons(DEFAULT_PAD_BINDINGS, 'jump', [12, 4]).bindings.jump).toEqual([4]);
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

  it('counts the default buttons in any order as the defaults', () => {
    const reversed: PadBindings = { ...DEFAULT_PAD_BINDINGS, pogo: [3, 1], fire: [7, 2] };
    expect(isDefaultPadBindings(reversed)).toBe(true);
    expect(isDefaultPadBindings({ ...DEFAULT_PAD_BINDINGS, pogo: [3] })).toBe(false);
    expect(isDefaultPadBindings({ ...DEFAULT_PAD_BINDINGS, pogo: [3, 4] })).toBe(false);
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
