// Tests for gamepad button names and hint tokens.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { hintText } from './font/tokens';
import { DEFAULT_PAD_BINDINGS } from './gamepad-bindings';
import {
  padActionNames,
  padActionToken,
  padActionTokens,
  padButtonName,
  padButtonToken,
  padFamily,
} from './gamepad-labels';

describe('padFamily', () => {
  it('reads Chrome and Firefox ids', () => {
    expect(padFamily('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe(
      'xbox',
    );
    expect(padFamily('045e-0b13-Xbox Wireless Controller')).toBe('xbox');
    expect(padFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe(
      'playstation',
    );
    expect(padFamily('054c-0ce6-DualSense Wireless Controller')).toBe('playstation');
    expect(padFamily('PS4 Controller')).toBe('playstation');
    expect(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe(
      'switch',
    );
    expect(padFamily('Nintendo Switch Pro Controller')).toBe('switch');
  });

  it('is generic for anything else, and for no id', () => {
    expect(padFamily('Fake pad')).toBe('generic');
    expect(padFamily('')).toBe('generic');
    expect(padFamily(null)).toBe('generic');
    expect(padFamily(undefined)).toBe('generic');
  });
});

describe('padButtonName', () => {
  it('names the face buttons by family', () => {
    expect([0, 1, 2, 3].map((i) => padButtonName(i, 'xbox'))).toEqual(['A', 'B', 'X', 'Y']);
    expect([0, 1, 2, 3].map((i) => padButtonName(i, 'generic'))).toEqual(['A', 'B', 'X', 'Y']);
    expect([0, 1, 2, 3].map((i) => padButtonName(i, 'playstation'))).toEqual([
      'Cross',
      'Circle',
      'Square',
      'Triangle',
    ]);
    // A Switch pad names the standard mapping's bottom button B, by position.
    expect([0, 1, 2, 3].map((i) => padButtonName(i, 'switch'))).toEqual(['B', 'A', 'Y', 'X']);
  });

  it('names the shoulders, triggers, Select and Start', () => {
    expect([4, 5, 6, 7, 8, 9].map((i) => padButtonName(i, 'xbox'))).toEqual([
      'LB',
      'RB',
      'LT',
      'RT',
      'Select',
      'Start',
    ]);
    expect([4, 5, 6, 7, 8, 9].map((i) => padButtonName(i, 'playstation'))).toEqual([
      'L1',
      'R1',
      'L2',
      'R2',
      'Share',
      'Options',
    ]);
    expect([4, 5, 6, 7, 8, 9].map((i) => padButtonName(i, 'switch'))).toEqual([
      'L',
      'R',
      'ZL',
      'ZR',
      'Minus',
      'Plus',
    ]);
  });

  it('gives an unnamed button a number', () => {
    expect(padButtonName(12, 'xbox')).toBe('Button 12');
  });
});

describe('padButtonToken', () => {
  it('uses a glyph where the font has one and a keycap otherwise', () => {
    expect(padButtonToken(0, 'xbox')).toBe('{A}');
    expect(padButtonToken(7, 'xbox')).toBe('{RT}');
    expect(padButtonToken(9, 'xbox')).toBe('{Start}');
    expect(padButtonToken(0, 'playstation')).toBe('{[Cross]}');
    expect(padButtonToken(0, 'switch')).toBe('{B}');
    expect(padButtonToken(7, 'switch')).toBe('{[ZR]}');
  });

  it('draws as glyphs, with no braces left', () => {
    expect(hintText(padButtonToken(0, 'playstation'))).not.toContain('{');
  });
});

describe('action labels', () => {
  it('give the defaults as the hints always showed them', () => {
    const b = DEFAULT_PAD_BINDINGS;
    expect(padActionTokens(b, 'jump', 'xbox')).toBe('{A}');
    expect(padActionTokens(b, 'pogo', 'xbox')).toBe('{B} {Y}');
    expect(padActionTokens(b, 'fire', 'xbox')).toBe('{X} {RT}');
    expect(padActionTokens(b, 'pause', 'xbox')).toBe('{Start}');
    expect(padActionToken(b, 'pogo', 'xbox')).toBe('{B}');
    expect(padActionNames(b, 'pogo', 'playstation')).toBe('Circle, Triangle');
  });
});
