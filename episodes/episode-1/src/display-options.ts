// The Display screen: its rows, the text on them, how a row steps and what the address fixes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Want } from '@lieutenant-fizz/engine/lifecycle-policy';
import { densityName } from './menu-density';
import { stepOption, type Options } from './options';
import type { MenuItem } from './ui';
import { NO_LOCKS, linkValue, lockedItem, type UrlLocks, type WakeUrl } from './url-lock';

/** The rows of the Display screen, in order. */
export type DisplayRow = 'fullscreen' | 'awake' | 'density' | 'back';

const ROWS: readonly DisplayRow[] = ['fullscreen', 'awake', 'density', 'back'];

/** What this page can do, which decides which rows exist. */
export interface DisplayCaps {
  /** The page can go fullscreen, and is not the native app (which has its own window). */
  fullscreen: boolean;
  /** Something can hold the screen on: the browser's wake lock, or the app's native backend. */
  keepAwake: boolean;
  /** The page is on a touch device, where menu rows have a height to choose (Row spacing). */
  touch: boolean;
}

/** The fullscreen choices a Fullscreen row steps through, in the order they are stored. */
export const FULLSCREEN_CHOICES: readonly Want[] = ['auto', 'on', 'off'];

const NAMES: Record<Want, string> = { auto: 'Auto', on: 'On', off: 'Off' };

/** The rows to show: a row appears only where the page can do what it sets. Back is always there. */
export const displayRows = (caps: DisplayCaps): DisplayRow[] =>
  ROWS.filter((r) =>
    r === 'fullscreen'
      ? caps.fullscreen
      : r === 'awake'
        ? caps.keepAwake
        : r === 'density'
          ? caps.touch
          : true,
  );

/** Whether Options should offer the Display screen at all: it has a row besides Back. */
export const displayShown = (caps: DisplayCaps): boolean => displayRows(caps).length > 1;

/** The menu id of a row, which the game acts on. */
export const displayRowId = (row: DisplayRow): string => `display:${row}`;

/** The row a menu id names, or null when it is not a Display row. */
export function displayRowOf(id: string | undefined): DisplayRow | null {
  if (!id?.startsWith('display:')) return null;
  const row = id.slice(8);
  return (ROWS as readonly string[]).includes(row) ? (row as DisplayRow) : null;
}

/** The fullscreen setting the player saved: Auto, On or Off. */
export const fullscreenChoice = (o: Pick<Options, 'fullscreen'>): Want =>
  FULLSCREEN_CHOICES[o.fullscreen] ?? 'auto';

/** The fullscreen setting in effect: `?fullscreen` wins, then the saved choice. The link never writes it. */
export const effectiveFullscreen = (url: Want | undefined, o: Pick<Options, 'fullscreen'>): Want =>
  url ?? fullscreenChoice(o);

/** Whether the screen is kept on in effect: `?wake` wins, then the saved choice. The link never writes it. */
export const effectiveWake = (url: WakeUrl | undefined, o: Pick<Options, 'awake'>): WakeUrl =>
  url ?? (o.awake ? 'on' : 'off');

/** The name of a fullscreen setting as the player reads it. */
export const fullscreenName = (want: Want): string => NAMES[want];

/** Whether the address fixes a row: `?fullscreen` fixes Fullscreen and `?wake` fixes Keep screen on. */
export const displayLocked = (row: DisplayRow, locks: UrlLocks): boolean =>
  (row === 'fullscreen' && locks.fullscreen !== undefined) ||
  (row === 'awake' && locks.wake !== undefined);

/** The value of the Display link row on Options: Fullscreen as it stands, or what the address fixed. */
export const displayLinkValue = (locks: UrlLocks, o: Pick<Options, 'fullscreen'>): string =>
  locks.fullscreen ? linkValue(NAMES[locks.fullscreen]) : NAMES[fullscreenChoice(o)];

/** The menu rows for these options. A row the address fixes shows its value with "(link)" and cannot be stepped. */
export function displayItems(o: Options, locks: UrlLocks, rows: readonly DisplayRow[]): MenuItem[] {
  return rows.map((row): MenuItem => {
    const id = displayRowId(row);
    switch (row) {
      case 'fullscreen':
        return locks.fullscreen
          ? lockedItem({ id, label: 'Fullscreen' }, NAMES[locks.fullscreen])
          : { id, label: 'Fullscreen', kind: 'choice', value: NAMES[fullscreenChoice(o)] };
      case 'awake':
        return locks.wake
          ? lockedItem({ id, label: 'Keep screen on' }, locks.wake === 'on' ? 'On' : 'Off')
          : { id, label: 'Keep screen on', kind: 'choice', value: o.awake ? 'On' : 'Off' };
      case 'density':
        return { id, label: 'Row spacing', kind: 'choice', value: densityName(o.density) };
      case 'back':
        return { id, label: 'Back' };
    }
  });
}

/** Whether a row changes with Left and Right (Back is chosen). */
export const isDisplayStepRow = (row: DisplayRow | null): boolean =>
  row === 'fullscreen' || row === 'awake' || row === 'density';

/**
 * One step on a row, `d` of -1 or +1. Every row is a choice, so a step goes round: Fullscreen through
 * Auto, On and Off, Keep screen on between On and Off, Row spacing through Compact, Cozy and Comfy. A
 * row that does not step, or that the address fixes, returns the same options.
 */
export function stepDisplay(
  o: Options,
  row: DisplayRow,
  d: number,
  locks: UrlLocks = NO_LOCKS,
): Options {
  if (displayLocked(row, locks)) return o;
  switch (row) {
    case 'fullscreen':
      return stepOption(o, 'fullscreen', d);
    case 'awake':
      return stepOption(o, 'awake', d);
    case 'density':
      return stepOption(o, 'density', d);
    default:
      return o;
  }
}
