// Tests for the key schemes: every scheme can be played, none clashes with itself, and only Keen-style uses modifiers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { Input, keysToBits, mouseToBits } from './input';
import {
  codeLabel,
  DEFAULT_KEY_SCHEME,
  effectiveScheme,
  KEY_SCHEMES,
  keyScheme,
  mouseAvailable,
  MOVE_KEYS,
  schemeAvailable,
  schemeCodes,
  stepScheme,
  usesMouse,
  watchMouseAvailable,
} from './key-schemes';

const MODIFIER = /^(Control|Alt|Shift|Meta)/;

/** The bits a scheme gives for pressing every key and button it has for one action. */
const actionBits = (s: (typeof KEY_SCHEMES)[number], a: 'jump' | 'pogo' | 'fire'): number =>
  keysToBits(new Set(s[a]), s) |
  mouseToBits(new Set(s.mouse?.[a] === undefined ? [] : [s.mouse[a]]), s);

describe('key schemes', () => {
  it('keep the places the first two layouts had, with Modern the default', () => {
    expect(KEY_SCHEMES[0]?.name).toBe('Keen-style');
    expect(KEY_SCHEMES[1]?.name).toBe('Modern');
    expect(DEFAULT_KEY_SCHEME).toBe(1);
    expect(keyScheme(99)).toBe(KEY_SCHEMES[DEFAULT_KEY_SCHEME]);
    expect(keyScheme(-1)).toBe(KEY_SCHEMES[DEFAULT_KEY_SCHEME]);
  });

  it('give Jump, the pogo and Fizz each a key or a mouse button, in every scheme', () => {
    for (const s of KEY_SCHEMES) {
      expect(actionBits(s, 'jump'), s.name).toBe(Input.JUMP);
      expect(actionBits(s, 'pogo'), s.name).toBe(Input.POGO);
      expect(actionBits(s, 'fire'), s.name).toBe(Input.FIRE);
    }
  });

  it('never use one key for two actions, or an action key for movement', () => {
    const move = new Set<string>(Object.values(MOVE_KEYS).flat());
    for (const s of KEY_SCHEMES) {
      const actions = [...s.jump, ...s.pogo, ...s.fire];
      expect(new Set(actions).size, s.name).toBe(actions.length);
      for (const code of actions) expect(move.has(code), `${s.name} ${code}`).toBe(false);
      const buttons = Object.values(s.mouse ?? {});
      expect(new Set(buttons).size, s.name).toBe(buttons.length);
    }
  });

  it('use no modifier key outside Keen-style, so no browser or desktop shortcut is in the way', () => {
    for (const s of KEY_SCHEMES) {
      const modifiers = schemeCodes(s).filter((c) => MODIFIER.test(c));
      if (s.name === 'Keen-style') expect(modifiers.length).toBeGreaterThan(0);
      else expect(modifiers, s.name).toEqual([]);
    }
  });

  it('leave the keys the game keeps for itself alone', () => {
    // F is fullscreen, P and Esc pause, Enter confirms, and the F keys save and load.
    const reserved = ['KeyF', 'KeyP', 'Escape', 'Enter', 'Pause', 'F5', 'F9', 'Tab'];
    for (const s of KEY_SCHEMES)
      for (const code of reserved) expect(schemeCodes(s), `${s.name} ${code}`).not.toContain(code);
  });

  it('use the mouse in one scheme only', () => {
    expect(KEY_SCHEMES.filter(usesMouse).map((s) => s.name)).toEqual(['Mouse']);
  });

  it('keep each one-handed scheme within its hand', () => {
    const leftHalf = /^(Key[QWERTASDFGZXCVB]|Space)$/;
    const rightHalf = /^(Arrow(Left|Right|Up|Down)|Comma|Period|Slash)$/;
    const left = KEY_SCHEMES.find((s) => s.name === 'Left hand')!;
    const right = KEY_SCHEMES.find((s) => s.name === 'Right hand')!;
    for (const c of [...left.move, ...left.jump, ...left.pogo, ...left.fire])
      expect(leftHalf.test(c), c).toBe(true);
    for (const c of [...right.move, ...right.jump, ...right.pogo, ...right.fire])
      expect(rightHalf.test(c), c).toBe(true);
  });
});

describe('which schemes a device offers', () => {
  const MOUSE = KEY_SCHEMES.findIndex((s) => s.name === 'Mouse');

  it('offers the Mouse scheme only where there is a mouse or trackpad', () => {
    for (let i = 0; i < KEY_SCHEMES.length; i += 1) {
      expect(schemeAvailable(i, true), KEY_SCHEMES[i]?.name).toBe(true);
      expect(schemeAvailable(i, false), KEY_SCHEMES[i]?.name).toBe(i !== MOUSE);
    }
    expect(schemeAvailable(99, true)).toBe(false);
  });

  it('plays a saved Mouse choice as Modern without a mouse, and keeps the choice', () => {
    expect(effectiveScheme(MOUSE, true)).toBe(MOUSE);
    expect(effectiveScheme(MOUSE, false)).toBe(DEFAULT_KEY_SCHEME);
    expect(effectiveScheme(2, false)).toBe(2);
    expect(effectiveScheme(99, true)).toBe(DEFAULT_KEY_SCHEME);
  });

  it('steps through every scheme with a mouse, wrapping round', () => {
    const seen: number[] = [];
    let at = 0;
    for (let i = 0; i < KEY_SCHEMES.length; i += 1) {
      seen.push(at);
      at = stepScheme(at, 1, true);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    expect(at).toBe(0);
    expect(stepScheme(0, -1, true)).toBe(KEY_SCHEMES.length - 1);
  });

  it('steps past the Mouse scheme without a mouse, in both directions', () => {
    expect(stepScheme(2, 1, false)).toBe(4);
    expect(stepScheme(4, -1, false)).toBe(2);
    expect(stepScheme(KEY_SCHEMES.length - 1, 1, false)).toBe(0);
    expect(stepScheme(0, -1, false)).toBe(KEY_SCHEMES.length - 1);
    let at = 0;
    for (let i = 0; i < 12; i += 1) {
      at = stepScheme(at, 1, false);
      expect(at).not.toBe(MOUSE);
    }
  });

  it('steps from a hidden choice to a scheme that is shown', () => {
    // Mouse saved on a device that lost its mouse: Options moves on to the next or previous scheme.
    expect(stepScheme(MOUSE, 1, false)).toBe(4);
    expect(stepScheme(MOUSE, -1, false)).toBe(2);
  });
});

describe('mouseAvailable', () => {
  const win = (matches: boolean): Pick<Window, 'matchMedia'> => ({
    matchMedia: (q: string) =>
      ({ matches: matches && q === '(any-pointer: fine)' }) as MediaQueryList,
  });

  it('asks whether any pointer is fine, which a touch screen alone is not', () => {
    expect(mouseAvailable(win(true))).toBe(true);
    expect(mouseAvailable(win(false))).toBe(false);
  });

  it('is false where the browser cannot say', () => {
    expect(mouseAvailable(undefined)).toBe(false);
    expect(mouseAvailable({} as Pick<Window, 'matchMedia'>)).toBe(false);
    const throws = {
      matchMedia: () => {
        throw new Error('blocked');
      },
    } as unknown as Pick<Window, 'matchMedia'>;
    expect(mouseAvailable(throws)).toBe(false);
  });

  it('reports a mouse arriving or leaving until stopped', () => {
    let fire: (e: { matches: boolean }) => void = () => {};
    const removed = vi.fn();
    const list = {
      matches: false,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => (fire = l),
      removeEventListener: removed,
    };
    const seen: boolean[] = [];
    const stop = watchMouseAvailable((m) => seen.push(m), {
      matchMedia: () => list as unknown as MediaQueryList,
    });
    fire({ matches: true });
    fire({ matches: false });
    expect(seen).toEqual([true, false]);
    stop();
    expect(removed).toHaveBeenCalledOnce();
  });
});

describe('codeLabel', () => {
  it('names a key as a US keyboard reads it when there is no layout map', () => {
    expect(codeLabel('KeyZ')).toBe('Z');
    expect(codeLabel('Comma')).toBe(',');
    expect(codeLabel('Slash')).toBe('/');
    expect(codeLabel('ArrowLeft')).toBe('←');
    expect(codeLabel('Space')).toBe('Space');
    expect(codeLabel('ControlLeft')).toBe('Ctrl');
  });

  it("names a key for the player's own keyboard from its layout map", () => {
    // On AZERTY the key in the W position types Z, and the key in the Z position types W.
    const azerty = new Map([
      ['KeyW', 'z'],
      ['KeyA', 'q'],
      ['KeyZ', 'w'],
      ['Comma', ';'],
    ]);
    expect(codeLabel('KeyW', azerty)).toBe('Z');
    expect(codeLabel('KeyA', azerty)).toBe('Q');
    expect(codeLabel('KeyZ', azerty)).toBe('W');
    expect(codeLabel('Comma', azerty)).toBe(';');
    // A key the map does not hold, or one that types more than a character, keeps its US name.
    expect(codeLabel('KeyX', azerty)).toBe('X');
    expect(codeLabel('KeyK', new Map([['KeyK', 'Dead']]))).toBe('K');
  });
});
