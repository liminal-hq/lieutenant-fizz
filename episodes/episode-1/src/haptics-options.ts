// The Haptics screen: its rows, the text on them, how a row steps, the two-tap Reset and what the address fixes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { modelDefaultLevel } from '@lieutenant-fizz/engine/pad-model';
import {
  DEFAULT_STRENGTH,
  stepStrength,
  strengthName,
  strengthScale,
} from '@lieutenant-fizz/engine/haptic-strength';
import type { Options } from './options';
import type { MenuItem } from './ui';
import { NO_LOCKS, linkValue, lockedItem, type HapticsUrl, type UrlLocks } from './url-lock';

/** The rows of the Haptics screen, in order. */
export type HapticsRow = 'strength' | 'rumble' | 'lab' | 'reset' | 'back';

const ROWS: readonly HapticsRow[] = ['strength', 'rumble', 'lab', 'reset', 'back'];

/** What this device offers, which decides which rows exist. */
export interface HapticsCaps {
  /** A pad with a vibration actuator has been seen this session, so a Rumble row would do something. */
  pad: boolean;
}

/** The haptics settings, which live in two places: the phone's strength is a touch setting, the rest are options. */
export interface HapticsSettings {
  /** The phone's strength, 0 Off to 3 Strong. */
  strength: number;
  /** The strength of the pad in use (the default when none has been used), 0 Off to 3 Strong. */
  rumble: number;
  /** The model of the pad in use (`vendorId:productId`), or null when none has been used: Rumble then changes the default. */
  padKey?: string | null;
  /** The name of the pad in use, shown on the Rumble row. */
  padName?: string | undefined;
  /** Whether the haptics lab is available without `?debug`. */
  lab: boolean;
}

/** The pad in use, as far as Rumble is concerned. */
export interface PadInUse {
  /** `vendorId:productId`. */
  key: string;
  name: string;
}

/** The rumble level of a pad model: its saved level, else the default (the old single Rumble value, lowered to the model's start). */
export const rumbleLevel = (
  o: Pick<Options, 'rumble' | 'rumblePads'>,
  key: string | null,
): number => (key === null ? undefined : o.rumblePads[key]) ?? modelDefaultLevel(key, o.rumble);

/** The options with the rumble level of a model set, or the default when no pad is in use. */
export const withRumble = (o: Options, key: string | null, level: number): Options =>
  key === null ? { ...o, rumble: level } : { ...o, rumblePads: { ...o.rumblePads, [key]: level } };

/** The haptics settings held in the touch settings and the options, with Rumble read for the pad in use. */
export const hapticsSettings = (
  touch: { hapticStrength: number },
  o: Pick<Options, 'rumble' | 'rumblePads' | 'hapticsLab'>,
  pad: PadInUse | null = null,
): HapticsSettings => ({
  strength: touch.hapticStrength,
  rumble: rumbleLevel(o, pad?.key ?? null),
  padKey: pad?.key ?? null,
  padName: pad?.name,
  lab: o.hapticsLab,
});

/** The rows to show: Rumble only once a pad that can rumble has been seen. */
export const hapticsRows = (caps: HapticsCaps): HapticsRow[] =>
  ROWS.filter((r) => r !== 'rumble' || caps.pad);

/** The menu id of a row, which the game acts on. */
export const hapticsRowId = (row: HapticsRow): string => `haptics:${row}`;

/** The row a menu id names, or null when it is not a Haptics row. */
export function hapticsRowOf(id: string | undefined): HapticsRow | null {
  if (!id?.startsWith('haptics:')) return null;
  const row = id.slice(8);
  return (ROWS as readonly string[]).includes(row) ? (row as HapticsRow) : null;
}

/**
 * A level in effect. `?haptics=off` is Off. `?haptics` (on) plays at the saved level, or at the default
 * when the saved level is Off, since a link that asks for haptics should not be silent. Without a link the
 * saved level stands. The link never changes the saved level.
 */
export function effectiveLevel(url: HapticsUrl | undefined, stored: number): number {
  if (url === 'off') return 0;
  if (url === 'on') return stored > 0 ? stored : DEFAULT_STRENGTH;
  return stored;
}

/** The master scale for a level once the address has had its say. */
export const effectiveScale = (url: HapticsUrl | undefined, stored: number): number =>
  strengthScale(effectiveLevel(url, stored));

/** Whether the address fixes a row: `?haptics` fixes Strength and Rumble, `?debug` puts the Haptics lab on. */
export const hapticsLocked = (row: HapticsRow, locks: UrlLocks): boolean =>
  ((row === 'strength' || row === 'rumble') && locks.haptics !== undefined) ||
  (row === 'lab' && locks.debug);

/** How the address reads on a strength row: On or Off. */
const linked = (url: HapticsUrl): string => (url === 'on' ? 'On' : 'Off');

/** The value of the Haptics link row on Options: the phone's strength in effect, or what the address fixed. */
export const hapticsLinkValue = (locks: UrlLocks, stored: number): string =>
  locks.haptics ? linkValue(linked(locks.haptics)) : strengthName(stored);

/** The Rumble row's value: the level, with the name of the pad it is for when one is in use ("Strong, Wireless Controller"). */
const rumbleValue = (h: HapticsSettings): string =>
  h.padName ? `${strengthName(h.rumble)}, ${h.padName}` : strengthName(h.rumble);

/** The menu rows for these settings. `armed` is whether Reset has had its first tap. */
export function hapticsItems(
  h: HapticsSettings,
  locks: UrlLocks,
  rows: readonly HapticsRow[],
  armed: boolean,
): MenuItem[] {
  return rows.map((row): MenuItem => {
    const id = hapticsRowId(row);
    switch (row) {
      case 'strength':
        return locks.haptics
          ? lockedItem({ id, label: 'Strength' }, linked(locks.haptics))
          : { id, label: 'Strength', kind: 'choice', value: strengthName(h.strength) };
      case 'rumble':
        return locks.haptics
          ? lockedItem({ id, label: 'Rumble' }, linked(locks.haptics))
          : { id, label: 'Rumble', kind: 'choice', value: rumbleValue(h) };
      case 'lab':
        return locks.debug
          ? lockedItem({ id, label: 'Haptics lab' }, 'On')
          : { id, label: 'Haptics lab', kind: 'choice', value: h.lab ? 'On' : 'Off' };
      case 'reset':
        return { id, label: 'Reset', ...(armed ? { value: 'Tap again' } : {}) };
      case 'back':
        return { id, label: 'Back' };
    }
  });
}

/** Whether a row changes with Left and Right (the others are chosen). */
export const isHapticsStepRow = (row: HapticsRow | null): boolean =>
  row === 'strength' || row === 'rumble' || row === 'lab';

/**
 * One step on a row, `d` of -1 or +1. At the end of a list a step stops, and choosing the row (`wrap`)
 * goes round to the other end. A row that does not step, or that the address fixes, returns the same settings.
 */
export function stepHaptics(
  h: HapticsSettings,
  row: HapticsRow,
  d: number,
  wrap: boolean,
  locks: UrlLocks = NO_LOCKS,
): HapticsSettings {
  if (hapticsLocked(row, locks)) return h;
  switch (row) {
    case 'strength':
      return { ...h, strength: stepStrength(h.strength, d, wrap) };
    case 'rumble':
      return { ...h, rumble: stepStrength(h.rumble, d, wrap) };
    case 'lab':
      return { ...h, lab: !h.lab };
    default:
      return h;
  }
}

/** Strength and Rumble back to Strong and the haptics lab Off; nothing else changes. `resetRumblePads` drops every pad model's saved Rumble. */
export const resetHaptics = (): HapticsSettings => ({
  strength: DEFAULT_STRENGTH,
  rumble: DEFAULT_STRENGTH,
  lab: false,
});

/** What a step on a row should be felt as. */
export type HapticsFeel =
  { kind: 'phone' } | { kind: 'pad' } | { kind: 'toggle'; on: boolean } | null;

/**
 * How a changed row answers the player: Strength buzzes the phone with a jump at the new level, Rumble
 * rumbles the pad with a bonk, and the lab row toggles. Null when nothing changed.
 */
export function hapticsFeel(
  before: HapticsSettings,
  after: HapticsSettings,
  row: HapticsRow,
): HapticsFeel {
  if (row === 'strength' && after.strength !== before.strength) return { kind: 'phone' };
  if (row === 'rumble' && after.rumble !== before.rumble) return { kind: 'pad' };
  if (row === 'lab' && after.lab !== before.lab) return { kind: 'toggle', on: after.lab };
  return null;
}

/** The options without any pad model's saved rumble level, so every model has its default again. */
export const resetRumblePads = (o: Options): Options => ({ ...o, rumblePads: {} });
