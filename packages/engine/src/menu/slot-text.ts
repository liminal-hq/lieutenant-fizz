// The text of a save slot's row: its title, its two lines and the numbers they come from.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { LaunchSlot } from '../launch';

/** What a slot row shows. `empty` rows carry no save details. */
export interface SlotSummary {
  id: LaunchSlot;
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
export const slotName = (id: LaunchSlot): string => (id === 'auto' ? 'Autosave' : `Slot ${id}`);

/** Number of levels cleared in a `doneMask` out of the first `total`, ignoring the secret flag above them. */
export function clearedCount(doneMask: number, total: number): number {
  let n = 0;
  for (let i = 0; i < total; i++) if (doneMask & (1 << i)) n++;
  return n;
}

/** Time played as `h:mm`. */
export function formatPlayed(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A short en-CA date such as `Wed, Oct. 7`. */
export function formatDate(at: number, timeZone?: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** The first line of a slot row: `Name · Place`, or `Name · Empty`. */
export const slotTitle = (s: SlotSummary): string => `${s.name} · ${s.empty ? 'Empty' : s.place}`;

/** A shorter second line for narrow windows: lives, score and time played only. */
export function slotBrief(s: SlotSummary, mode: 'save' | 'load'): string {
  if (s.empty) return mode === 'save' ? 'Save here' : 'Nothing saved';
  return [`Lives ${s.lives}`, `${s.score.toLocaleString('en-CA')} pts`, s.played].join(' · ');
}

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
