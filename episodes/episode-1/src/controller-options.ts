// The Controller screen: its rows, the text on them and the Options link. The binding logic is in the engine.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  PAD_ACTIONS,
  PAD_ACTION_NAMES,
  isDefaultPadBindings,
  type PadAction,
  type PadBindings,
} from '@lieutenant-fizz/engine/gamepad-bindings';
import { padActionNames, type PadFamily } from '@lieutenant-fizz/engine/gamepad-labels';
import type { RemapState } from '@lieutenant-fizz/engine/gamepad-remap';
import type { MenuItem } from './ui';

/** The rows of the Controller screen, in order: the four actions, Reset and Back. */
export type ControllerRow = PadAction | 'reset' | 'back';

/** The rows in order. */
export const CONTROLLER_ROWS: readonly ControllerRow[] = [...PAD_ACTIONS, 'reset', 'back'];

/** The menu id of a row, which the game acts on. */
export const controllerRowId = (row: ControllerRow): string => `controller:${row}`;

/** The row a menu id names, or null when it is not a Controller row. */
export function controllerRowOf(id: string | undefined): ControllerRow | null {
  if (!id?.startsWith('controller:')) return null;
  const row = id.slice(11);
  return (CONTROLLER_ROWS as readonly string[]).includes(row) ? (row as ControllerRow) : null;
}

/** The action a row binds, or null for Reset and Back. */
export const controllerAction = (row: ControllerRow | null): PadAction | null =>
  row && (PAD_ACTIONS as readonly string[]).includes(row) ? (row as PadAction) : null;

/** What the Options row says: "Default" while the buttons are the standard ones, "Custom" after a change. */
export const controllerLinkValue = (b: PadBindings): string =>
  isDefaultPadBindings(b) ? 'Default' : 'Custom';

/**
 * The menu rows. Each action shows its buttons by their name on the controller in use ("B, Y"); the row
 * being bound says so instead. `armed` is whether Reset has had its first tap.
 */
export function controllerItems(
  b: PadBindings,
  family: PadFamily,
  remap: RemapState,
  armed: boolean,
): MenuItem[] {
  return CONTROLLER_ROWS.map((row): MenuItem => {
    const id = controllerRowId(row);
    switch (row) {
      case 'reset':
        return { id, label: 'Reset to defaults', ...(armed ? { value: 'Tap again' } : {}) };
      case 'back':
        return { id, label: 'Back' };
      default:
        return {
          id,
          label: PAD_ACTION_NAMES[row],
          value:
            remap.kind === 'listening' && remap.action === row
              ? 'Press a button'
              : padActionNames(b, row, family),
        };
    }
  });
}
