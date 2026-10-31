// Turns saves into the text and numbers the save-slot screen shows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  clearedCount as clearedOf,
  formatDate,
  formatPlayed,
  slotName,
  type SlotSummary,
} from '@lieutenant-fizz/engine/menu/slot-text';
import type { SlotId, Stored } from './save';
import { SAUCER_ID } from './story';

/** Overworld area names, by the area id the sim reports. */
export const AREA_NAMES = [
  'Crater Fields',
  'Marshmallow Meadows',
  'Rock Candy Reach',
  'Frosting Frontier',
  'Gumdrop Isle',
] as const;

/** How many levels count towards the cleared pips: all of them except the saucer visit. */
export const LEVEL_TOTAL = SAUCER_ID;

/** The overworld area name for an area id, falling back to the first area. */
export const areaName = (area: number): string => AREA_NAMES[area] ?? AREA_NAMES[0];

/** Number of levels cleared in a `doneMask`, ignoring the secret flag. */
export const clearedCount = (doneMask: number): number => clearedOf(doneMask, LEVEL_TOTAL);

/** Builds the row for one slot. `place` is the overworld area name where the save was made. */
export function summarise(id: SlotId, save: Stored | null, place: string): SlotSummary {
  const base = { id, name: slotName(id), readOnly: id === 'auto' || id === 'quick' };
  if (!save) {
    return {
      ...base,
      empty: true,
      place: '',
      cleared: 0,
      total: LEVEL_TOTAL,
      lives: 0,
      score: 0,
      played: '',
      date: '',
    };
  }
  const p = save.progress;
  return {
    ...base,
    empty: false,
    place,
    cleared: clearedCount(p.doneMask),
    total: LEVEL_TOTAL,
    lives: p.lives,
    score: p.score,
    played: formatPlayed(p.played),
    date: formatDate(save.at),
  };
}
