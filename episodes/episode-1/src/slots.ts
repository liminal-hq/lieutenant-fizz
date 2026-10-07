// Turns saves into the text and numbers the save-slot screen shows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

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

/** What a slot row shows. `empty` rows carry no save details. */
export interface SlotSummary {
  id: SlotId;
  name: string;
  empty: boolean;
  /** The autosave can be loaded but never saved over. */
  readOnly: boolean;
  place: string;
  cleared: number;
  total: number;
  lives: number;
  score: number;
  /** Time played as hours and minutes, such as `1:12`. */
  played: string;
  /** The date saved, in Canadian English, such as `Wed, Oct. 7`. */
  date: string;
}

/** The name of a slot: Autosave, or Slot 1 to 4. */
export const slotName = (id: SlotId): string => (id === 'auto' ? 'Autosave' : `Slot ${id}`);

/** The overworld area name for an area id, falling back to the first area. */
export const areaName = (area: number): string => AREA_NAMES[area] ?? AREA_NAMES[0];

/** Number of levels cleared in a `doneMask`, ignoring the secret flag. */
export function clearedCount(doneMask: number): number {
  let n = 0;
  for (let i = 0; i < LEVEL_TOTAL; i++) if (doneMask & (1 << i)) n++;
  return n;
}

/** Time played as `h:mm`. */
export function formatPlayed(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A short en-CA date such as `Wed, Oct. 7`. */
export function formatDate(at: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(at));
}

/** Builds the row for one slot. `place` is the overworld area name where the save was made. */
export function summarise(id: SlotId, save: Stored | null, place: string): SlotSummary {
  const base = { id, name: slotName(id), readOnly: id === 'auto' };
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

/** The first line of a slot row: `Name · Place`, or `Name · Empty`. */
export const slotTitle = (s: SlotSummary): string => `${s.name} · ${s.empty ? 'Empty' : s.place}`;

/** The second line of a slot row. Empty slots say what the screen can do with them. */
export function slotDetail(s: SlotSummary, mode: 'save' | 'load'): string {
  if (s.empty) return mode === 'save' ? 'Save here' : 'Save from the pause menu to use this slot';
  const parts = [
    `Lives ${s.lives}`,
    `${s.score.toLocaleString('en-CA')} pts`,
    `${s.played} played`,
    s.date,
  ];
  if (s.readOnly) parts.push('read-only');
  return parts.join(' · ');
}
