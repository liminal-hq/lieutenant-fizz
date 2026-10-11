// Tests for the gamepad hints and Controls column once the buttons are remapped and named for the controller.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { DEFAULT_PAD_BINDINGS, bindButton } from '@lieutenant-fizz/engine/gamepad-bindings';
import { describe, expect, it } from 'vitest';
import {
  backHint,
  controlsTable,
  creditsHints,
  jumpHint,
  menuHint,
  menuHints,
  selectHint,
  type HintContext,
} from './hints';

const remapped = bindButton(
  bindButton(DEFAULT_PAD_BINDINGS, 'jump', 4).bindings,
  'pogo',
  5,
).bindings;
const xbox: HintContext = {
  device: 'gamepad',
  layout: 0,
  pad: { bindings: remapped, family: 'xbox' },
};
const ps: HintContext = {
  device: 'gamepad',
  layout: 0,
  pad: { bindings: DEFAULT_PAD_BINDINGS, family: 'playstation' },
};

describe('hints with remapped buttons', () => {
  it('show the Jump, Pogo and Pause buttons as Select, Back and Menu', () => {
    expect(jumpHint(xbox)).toBe('{LB}');
    expect(selectHint(xbox)).toBe('{LB}');
    expect(backHint(xbox)).toBe('{RB}');
    expect(menuHint(xbox)).toBe('{Start}');
    expect(menuHints('options', xbox).at(-1)).toBe('{RB} Back');
    expect(menuHints('list', xbox)).toEqual(['{[↑↓]} Choose', '{LB} Select']);
    expect(creditsHints(xbox, 'Speed up')).toEqual(['{Start} Skip credits', '{LB} Speed up']);
  });

  it('name the buttons for the controller family', () => {
    expect(selectHint(ps)).toBe('{[Cross]}');
    expect(backHint(ps)).toBe('{[Circle]}');
    expect(menuHint(ps)).toBe('{[Options]}');
  });

  it('leave the keyboard and touch hints alone', () => {
    const key: HintContext = { ...xbox, device: 'keyboard' };
    expect(selectHint(key)).toBe('{Enter}');
    expect(backHint(key)).toBe('{Esc}');
    expect(jumpHint(key)).toBe('{Ctrl}');
    expect(selectHint({ ...xbox, device: 'touch' })).toBe('{[Select]}');
  });

  it('show the Start button as the way to cancel a listen on a pad, whatever Pause is bound to', () => {
    expect(menuHints('listen', xbox)).toEqual(['Hold {Start} Cancel']);
    expect(menuHints('listen', ps)).toEqual(['Hold {[Options]} Cancel']);
    expect(menuHints('listen', { device: 'keyboard', layout: 0 })).toEqual(['{Esc} Cancel']);
    expect(menuHints('listen', { device: 'touch', layout: 0 })).toEqual(['{[Back]} Cancel']);
  });
});

describe('the Controls table with remapped buttons', () => {
  it('shows each action’s buttons in the Gamepad column', () => {
    const rows = controlsTable(xbox, false).rows;
    expect(rows.find((r) => r[0] === 'Jump')?.[3]).toBe('{LB}');
    expect(rows.find((r) => r[0] === 'Pogo (toggle)')?.[3]).toBe('{RB}');
    expect(rows.find((r) => r[0] === 'Fizz')?.[3]).toBe('{X} {RT}');
    expect(rows.find((r) => r[0] === 'Menu')?.[3]).toBe('{Start}');
    expect(controlsTable(ps, false).rows.find((r) => r[0] === 'Pogo (toggle)')?.[3]).toBe(
      '{[Circle]} {[Triangle]}',
    );
  });

  it('leaves the keyboard columns alone', () => {
    const row = controlsTable(xbox, false).rows.find((r) => r[0] === 'Jump');
    expect(row?.slice(0, 3)).toEqual(['Jump', '{Ctrl}', '{[Z]}']);
  });
});
