// Tests for the device-aware hint strings.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  backHint,
  controlsColumn,
  creditsHints,
  jumpHint,
  menuHint,
  menuHints,
  selectHint,
  stingerHints,
  type HintContext,
} from './hints';

const keen: HintContext = { device: 'keyboard', layout: 0 };
const modern: HintContext = { device: 'keyboard', layout: 1 };
const pad: HintContext = { device: 'gamepad', layout: 0 };

describe('hint labels', () => {
  it('shows the jump key for the layout, and A on a gamepad', () => {
    expect(jumpHint(keen)).toBe('{Ctrl}');
    expect(jumpHint(modern)).toBe('{[Z]}');
    expect(jumpHint(pad)).toBe('{A}');
    expect(jumpHint({ device: 'gamepad', layout: 1 })).toBe('{A}');
  });

  it('switches select, back and menu labels with the device', () => {
    expect(selectHint(keen)).toBe('{Enter}');
    expect(selectHint(pad)).toBe('{A}');
    expect(backHint(keen)).toBe('{Esc}');
    expect(backHint(pad)).toBe('{B}');
    expect(menuHint(keen)).toBe('{Esc}');
    expect(menuHint(pad)).toBe('{Start}');
  });
});

describe('menu hints', () => {
  it('shows choose and select on a plain list', () => {
    expect(menuHints('list', keen)).toEqual(['{[↑↓]} Choose', '{Enter} Select']);
    expect(menuHints('list', pad)).toEqual(['{[↑↓]} Choose', '{A} Select']);
  });

  it('adds change and back on Options', () => {
    expect(menuHints('options', keen)).toEqual(['{[↑↓]} Choose', '{[←→]} Change', '{Esc} Back']);
    expect(menuHints('options', pad).at(-1)).toBe('{B} Back');
  });

  it('shows back on the saves screen and resume on pause', () => {
    expect(menuHints('saves', keen).at(-1)).toBe('{Esc} Back');
    expect(menuHints('pause', keen).at(-1)).toBe('{Esc} Resume');
    expect(menuHints('pause', pad).at(-1)).toBe('{Start} Resume');
  });
});

describe('credits and stinger hints', () => {
  it('maps {Jump} to the active device', () => {
    expect(creditsHints(keen, 'Speed up')).toEqual(['{Esc} Skip credits', '{Ctrl} Speed up']);
    expect(creditsHints(modern, 'Continue')).toEqual(['{Esc} Skip credits', '{[Z]} Continue']);
    expect(creditsHints(pad, 'Speed up')).toEqual(['{Start} Skip credits', '{A} Speed up']);
    expect(stingerHints(pad)).toEqual(['{Start} Skip', '{A} Continue']);
  });
});

describe('controlsColumn', () => {
  it('highlights the layout column, or the gamepad column while a pad is in use', () => {
    expect(controlsColumn(keen)).toBe(1);
    expect(controlsColumn(modern)).toBe(2);
    expect(controlsColumn(pad)).toBe(3);
    expect(controlsColumn({ device: 'gamepad', layout: 1 })).toBe(3);
  });
});
