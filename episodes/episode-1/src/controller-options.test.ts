// Tests for the Controller screen's rows and their text.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { DEFAULT_PAD_BINDINGS, bindButton } from '@lieutenant-fizz/engine/gamepad-bindings';
import { IDLE, startListening, stepRemap } from '@lieutenant-fizz/engine/gamepad-remap';
import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_ROWS,
  controllerAction,
  controllerItems,
  controllerLinkValue,
  controllerRowId,
  controllerRowOf,
} from './controller-options';

describe('the Controller rows', () => {
  it('are the four actions, Reset and Back', () => {
    expect(CONTROLLER_ROWS).toEqual(['jump', 'pogo', 'fire', 'pause', 'reset', 'back']);
  });

  it('round-trip through their menu ids', () => {
    for (const r of CONTROLLER_ROWS) expect(controllerRowOf(controllerRowId(r))).toBe(r);
    expect(controllerRowOf('haptics:back')).toBeNull();
    expect(controllerRowOf('controller:nope')).toBeNull();
    expect(controllerRowOf(undefined)).toBeNull();
  });

  it('bind an action only for the four actions', () => {
    expect(controllerAction('fire')).toBe('fire');
    expect(controllerAction('reset')).toBeNull();
    expect(controllerAction('back')).toBeNull();
    expect(controllerAction(null)).toBeNull();
  });
});

describe('controllerItems', () => {
  it('shows each action with its buttons by name', () => {
    const items = controllerItems(DEFAULT_PAD_BINDINGS, 'xbox', IDLE, false);
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Jump', 'A'],
      ['Pogo', 'B, Y'],
      ['Fizz', 'X, RT'],
      ['Pause', 'Start'],
      ['Reset to defaults', undefined],
      ['Back', undefined],
    ]);
  });

  it('names the buttons for the controller', () => {
    const items = controllerItems(DEFAULT_PAD_BINDINGS, 'playstation', IDLE, false);
    expect(items[0]?.value).toBe('Cross');
    expect(items[3]?.value).toBe('Options');
  });

  it('shows the new buttons after a change', () => {
    const b = bindButton(DEFAULT_PAD_BINDINGS, 'jump', 4).bindings;
    expect(controllerItems(b, 'xbox', IDLE, false)[0]?.value).toBe('LB');
  });

  it('says so on the row being bound, and only that one', () => {
    const items = controllerItems(
      DEFAULT_PAD_BINDINGS,
      'xbox',
      startListening('pogo', 0, new Set()),
      false,
    );
    expect(items[1]?.value).toBe('Press buttons');
    expect(items[0]?.value).toBe('A');
  });

  it('shows every button pressed so far while listening, and all names once bound', () => {
    let s = startListening('pogo', 0, new Set());
    s = stepRemap(s, DEFAULT_PAD_BINDINGS, 10, new Set([4, 5])).state;
    expect(controllerItems(DEFAULT_PAD_BINDINGS, 'xbox', s, false)[1]?.value).toBe('LB, RB …');
    expect(controllerItems(DEFAULT_PAD_BINDINGS, 'xbox', IDLE, false)[1]?.value).toBe('B, Y');
  });

  it('asks for a second tap on Reset once armed', () => {
    expect(controllerItems(DEFAULT_PAD_BINDINGS, 'xbox', IDLE, true)[4]?.value).toBe('Tap again');
  });

  it('gives every row an id and no steppers', () => {
    for (const i of controllerItems(DEFAULT_PAD_BINDINGS, 'xbox', IDLE, false)) {
      expect(i.id).toBeTruthy();
      expect(i.kind).toBeUndefined();
    }
  });
});

describe('controllerLinkValue', () => {
  it('reads Default or Custom', () => {
    expect(controllerLinkValue(DEFAULT_PAD_BINDINGS)).toBe('Default');
    expect(controllerLinkValue(bindButton(DEFAULT_PAD_BINDINGS, 'fire', 4).bindings)).toBe(
      'Custom',
    );
  });
});
