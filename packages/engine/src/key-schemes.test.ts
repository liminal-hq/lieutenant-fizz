// Tests for the key schemes: every scheme can be played, none clashes with itself, and only Keen-style uses modifiers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Input, keysToBits, mouseToBits } from './input';
import {
  codeLabel,
  DEFAULT_KEY_SCHEME,
  KEY_SCHEMES,
  keyScheme,
  normaliseScheme,
  stepScheme,
  MOVE_KEYS,
  schemeCodes,
  usesMouse,
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

  it('use the mouse in WASD and Mouse jump only, as well as their keys', () => {
    expect(KEY_SCHEMES.filter(usesMouse).map((s) => s.name)).toEqual(['WASD', 'Mouse jump']);
    expect(KEY_SCHEMES.some((s) => s.name === 'Mouse')).toBe(false);
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

describe('scheme numbers', () => {
  it('are saved ids that keep the meaning the first layouts had', () => {
    expect(KEY_SCHEMES.map((s) => s.id)).toEqual([0, 1, 2, 6, 4, 5]);
    expect(KEY_SCHEMES.map((s) => s.name)).toEqual([
      'Keen-style',
      'Modern',
      'WASD',
      'Mouse jump',
      'Left hand',
      'Right hand',
    ]);
    expect(new Set(KEY_SCHEMES.map((s) => s.id)).size).toBe(KEY_SCHEMES.length);
  });

  it('read a saved Mouse as WASD, and anything unknown as the default', () => {
    expect(keyScheme(3).name).toBe('WASD');
    expect(normaliseScheme(3)).toBe(2);
    for (const s of KEY_SCHEMES) expect(normaliseScheme(s.id)).toBe(s.id);
    for (const bad of [-1, 7, 99, 1.5, '1', null, undefined, NaN])
      expect(normaliseScheme(bad), String(bad)).toBe(DEFAULT_KEY_SCHEME);
    expect(keyScheme(99).id).toBe(DEFAULT_KEY_SCHEME);
  });

  it('step through the order Options shows, in both directions and wrapping', () => {
    const forwards: number[] = [];
    let at = 0;
    for (let i = 0; i < KEY_SCHEMES.length; i += 1) {
      forwards.push(at);
      at = stepScheme(at, 1);
    }
    expect(forwards).toEqual([0, 1, 2, 6, 4, 5]);
    expect(at).toBe(0);
    const backwards: number[] = [];
    at = 5;
    for (let i = 0; i < KEY_SCHEMES.length; i += 1) {
      backwards.push(at);
      at = stepScheme(at, -1);
    }
    expect(backwards).toEqual([5, 4, 6, 2, 1, 0]);
    expect(at).toBe(5);
    // Right and Left undo each other from every scheme.
    for (const s of KEY_SCHEMES) expect(stepScheme(stepScheme(s.id, 1), -1)).toBe(s.id);
  });

  it('step on from a retired Mouse choice as from WASD', () => {
    expect(stepScheme(3, 1)).toBe(6);
    expect(stepScheme(3, -1)).toBe(1);
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
