// What a gamepad button is called: its name on the controller family in use, and the hint token that draws it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BUTTON_CODES } from './font/tokens';
import type { PadAction, PadBindings } from './gamepad-bindings';

/**
 * The controller families whose button names differ. `generic` is a pad that none of the others matches:
 * it reads as the standard mapping's own names, which are the Xbox ones.
 */
export type PadFamily = 'xbox' | 'playstation' | 'switch' | 'generic';

/**
 * Guesses the family from a gamepad's `id`. Chrome writes "Name (STANDARD GAMEPAD Vendor: 054c Product: …)"
 * and Firefox "054c-09cc-Name", so the vendor id and the product name are both checked. Anything else is
 * generic.
 */
export function padFamily(id: string | null | undefined): PadFamily {
  const s = (id ?? '').toLowerCase();
  if (/dualsense|dualshock|playstation|\bps[345]\b|054c/.test(s)) return 'playstation';
  if (/nintendo|pro controller|joy-?con|057e/.test(s)) return 'switch';
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  return 'generic';
}

const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start'] as const;
const PLAYSTATION = [
  'Cross',
  'Circle',
  'Square',
  'Triangle',
  'L1',
  'R1',
  'L2',
  'R2',
  'Share',
  'Options',
] as const;
// The Switch's A and B (and X and Y) swap places against the standard mapping, which names the
// buttons by position: index 0 is the bottom button, which a Switch controller calls B.
const SWITCH = ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus'] as const;

/** A button's name on a family ("A", "Cross", "ZR"), or "Button 12" for one with no name. */
export function padButtonName(index: number, family: PadFamily): string {
  const names = family === 'playstation' ? PLAYSTATION : family === 'switch' ? SWITCH : XBOX;
  return names[index] ?? `Button ${index}`;
}

/**
 * A button as a hint token (see `hintText`): its glyph where the font has one (A, B, X, Y, the Xbox
 * shoulders and triggers, Start and Select), otherwise a keycap with its name.
 */
export function padButtonToken(index: number, family: PadFamily): string {
  const name = padButtonName(index, family);
  return name in BUTTON_CODES ? `{${name}}` : `{[${name}]}`;
}

/** An action's buttons as hint tokens, in binding order and separated by a space. */
export function padActionTokens(b: PadBindings, action: PadAction, family: PadFamily): string {
  return b[action].map((i) => padButtonToken(i, family)).join(' ');
}

/** An action's buttons as plain names, such as "B, Y". */
export function padActionNames(b: PadBindings, action: PadAction, family: PadFamily): string {
  return b[action].map((i) => padButtonName(i, family)).join(', ');
}

/** The first button of an action as a token: what a hint shows when it names one button. */
export function padActionToken(b: PadBindings, action: PadAction, family: PadFamily): string {
  return padButtonToken(b[action][0] ?? 0, family);
}

/** The labels a hint needs: the bindings and the family to name them in. */
export interface PadLabels {
  bindings: PadBindings;
  family: PadFamily;
}
