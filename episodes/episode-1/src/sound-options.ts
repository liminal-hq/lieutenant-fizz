// The Sound screen: its rows, the text on them, how a row steps, the two-tap Reset and the preview that follows a step.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  resolveAudioMode,
  type AudioMode,
  type SoundAt,
} from '@lieutenant-fizz/engine/sound-field';
import { audioChoice, DEFAULT_OPTIONS, stepOption, type Options } from './options';
import type { MenuItem } from './ui';

/** The rows of the Sound screen, in order. */
export type SoundRow = 'style' | 'music' | 'sfx' | 'reset' | 'back';

const ROWS: readonly SoundRow[] = ['style', 'music', 'sfx', 'reset', 'back'];

/** The styles a Style row steps through, in order. */
const STYLES: readonly AudioMode[] = ['classic', 'enhanced'];

const NAMES: Record<AudioMode, string> = { classic: 'Classic', enhanced: 'Enhanced' };

/** The rows to show. */
export const soundRows = (): SoundRow[] => [...ROWS];

/** The menu id of a row, which the game acts on. */
export const soundRowId = (row: SoundRow): string => `sound:${row}`;

/** The row a menu id names, or null when it is not a Sound row. */
export function soundRowOf(id: string | undefined): SoundRow | null {
  if (!id?.startsWith('sound:')) return null;
  const row = id.slice(6);
  return (ROWS as readonly string[]).includes(row) ? (row as SoundRow) : null;
}

/** The name of a sound style as the player reads it. */
export const styleName = (mode: AudioMode): string => NAMES[mode];

/**
 * The mode in effect: a `?audio=` value wins, then the player's saved choice, then the game's default.
 * The URL never writes the saved choice.
 */
export function effectiveAudio(
  forced: AudioMode | undefined,
  o: Pick<Options, 'audio'>,
): AudioMode {
  return resolveAudioMode(forced ?? audioChoice(o));
}

/**
 * The menu rows for these options. Style shows what Auto resolves to; while `?audio=` forces a mode
 * it shows that mode and cannot be stepped. `armed` is whether Reset has had its first tap.
 */
export function soundItems(
  o: Options,
  forced: AudioMode | undefined,
  rows: readonly SoundRow[],
  armed: boolean,
): MenuItem[] {
  return rows.map((row): MenuItem => {
    const id = soundRowId(row);
    switch (row) {
      case 'style':
        return forced
          ? { id, label: 'Style', kind: 'choice', value: `${NAMES[forced]} (link)`, disabled: true }
          : { id, label: 'Style', kind: 'choice', value: NAMES[effectiveAudio(undefined, o)] };
      case 'music':
        return { id, label: 'Music', kind: 'meter', meter: o.music };
      case 'sfx':
        return { id, label: 'Effects', kind: 'meter', meter: o.sfx };
      case 'reset':
        return { id, label: 'Reset', ...(armed ? { value: 'Tap again' } : {}) };
      case 'back':
        return { id, label: 'Back' };
    }
  });
}

/** Whether a row changes with Left and Right (the others are chosen). */
export const isSoundStepRow = (row: SoundRow | null): boolean =>
  row === 'style' || row === 'music' || row === 'sfx';

/**
 * One step on a row, `d` of -1 or +1. At the end of a list a step stops, and choosing the row (`wrap`)
 * goes round to the other end. Stepping Style saves an explicit choice; a step that cannot move leaves
 * Auto alone. A row that does not step returns the same options.
 */
export function stepSound(o: Options, row: SoundRow, d: number, wrap: boolean): Options {
  switch (row) {
    case 'style': {
      const n = STYLES.length;
      const i = STYLES.indexOf(effectiveAudio(undefined, o)) + d;
      const next = STYLES[wrap ? (i + n) % n : Math.min(n - 1, Math.max(0, i))] as AudioMode;
      if (next === effectiveAudio(undefined, o)) return o;
      return { ...o, audio: next === 'classic' ? 1 : 2 };
    }
    case 'music':
      return stepOption(o, 'music', d, wrap);
    case 'sfx':
      return stepOption(o, 'sfx', d, wrap);
    default:
      return o;
  }
}

/** The sound options back to their defaults (Auto, full volume); nothing else changes. */
export function resetSound(o: Options): Options {
  const d = DEFAULT_OPTIONS;
  return { ...o, audio: d.audio, music: d.music, sfx: d.sfx };
}

/** A sound to play as a preview: after `delayMs`, at `at` in the stereo field (Classic plays it centred). */
export interface Preview {
  name: string;
  at?: SoundAt;
  delayMs: number;
}

/** How long after the last step a preview plays, so a held key does not play one per step. */
export const PREVIEW_DELAY_MS = 250;

/**
 * The sounds to play after a step on a row, once the new options are in use. Style plays a boing on the
 * left, then a plink on the right: Enhanced puts them apart and Classic plays both centred, so one step
 * is the comparison. Effects play a crunch at the new level (silent at 0). Music changes the running
 * track, so it has no preview of its own.
 */
export function soundPreview(row: SoundRow, o: Pick<Options, 'sfx'>): Preview[] {
  switch (row) {
    case 'style':
      return [
        { name: 'boing', at: { pan: -0.5, gain: 1 }, delayMs: 0 },
        { name: 'plink', at: { pan: 0.5, gain: 1 }, delayMs: 160 },
      ];
    case 'sfx':
      return o.sfx > 0 ? [{ name: 'crunch', delayMs: 0 }] : [];
    default:
      return [];
  }
}
