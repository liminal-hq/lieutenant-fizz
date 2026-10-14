// Player options: volumes, sound style, captions, controls layout, text size and motion, saved on this device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  DEFAULT_GLOBAL_OPTIONS,
  METER_BLOCKS,
  parseGlobalOptions,
  stepGlobalOption,
  type GlobalKey,
  type GlobalOptions,
} from '@lieutenant-fizz/engine/options';
import {
  readOptionsFile,
  resolveRaw,
  setValue,
  writeOptionsFile,
  type Scope,
} from '@lieutenant-fizz/engine/options-file';
import type { AudioMode } from '@lieutenant-fizz/engine/sound-field';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';

/**
 * Storage key for this episode's options as an older build saved them (the version lives inside the saved JSON).
 * The shared options file (`lf-options-v1`, see the engine's `options-file.ts`) holds them now: the first read
 * carries them over, and each save keeps this key up to date with what the episode sees, so an older build and
 * the browser checks still find them.
 */
export const OPTIONS_KEY = 'lf-ep1-options-v1';

/** This episode's name in the shared options file. */
export const EPISODE_ID = 'episode-1';

export const LAYOUTS = ['Keen-style', 'Modern'] as const;

/** The options only this episode has: they are saved in its own section, never as an app-wide value. */
export const EPISODE_KEYS = ['captions', 'layout', 'lab', 'hapticsLab'] as const;

/** What only this episode has. */
export interface EpisodeOptions {
  /** Floating sound captions on or off. */
  captions: boolean;
  /** Which keyboard layout the hints and Controls table show: 0 Keen-style, 1 Modern. */
  layout: number;
  /** Whether the sound lab is available without `?debug`. Off by default. */
  lab: boolean;
  /** Whether the haptics lab is available without `?debug`. Off by default. */
  hapticsLab: boolean;
}

/** Every option the Options screens show: the app-wide ones, and this episode's own. */
export type Options = GlobalOptions & EpisodeOptions;

/** The keys of {@link Options} the Options screen can change. */
export type SettingKey = Exclude<keyof Options, 'rumblePads'>;

/** Volumes start at full, which is how the game sounded before there were options. */
export const DEFAULT_OPTIONS: Readonly<Options> = {
  ...DEFAULT_GLOBAL_OPTIONS,
  captions: true,
  layout: 0,
  lab: false,
  hapticsLab: false,
};

const int = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;

/** The options in a stored record; any missing or invalid field falls back to its default. */
export function parseOptionsRaw(raw: Readonly<Record<string, unknown>> | null): Options {
  const d = DEFAULT_OPTIONS;
  return {
    ...parseGlobalOptions(raw),
    captions: typeof raw?.['captions'] === 'boolean' ? raw['captions'] : d.captions,
    layout: int(raw?.['layout'], 0, LAYOUTS.length - 1, d.layout),
    lab: typeof raw?.['lab'] === 'boolean' ? raw['lab'] : d.lab,
    hapticsLab: typeof raw?.['hapticsLab'] === 'boolean' ? raw['hapticsLab'] : d.hapticsLab,
  };
}

/** Parses options saved as one blob (`{v: 1, ...fields}`); any missing or invalid field falls back to its default. */
export function parseOptions(json: string | null): Options {
  try {
    const raw = (json ? JSON.parse(json) : null) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return parseOptionsRaw(null);
    return parseOptionsRaw(raw);
  } catch {
    return parseOptionsRaw(null);
  }
}

export function serialiseOptions(o: Options): string {
  return JSON.stringify({ v: 1, ...o });
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Store = Pick<KeyValueStorage, 'getItem' | 'setItem'>;

const LEGACY = [{ episode: EPISODE_ID, key: OPTIONS_KEY }] as const;

/** The options this episode sees: the app-wide values with its own overrides on top. */
export function readOptions(store: Reader | null): Options {
  try {
    const file = readOptionsFile(store, LEGACY, EPISODE_KEYS);
    return parseOptionsRaw(resolveRaw(file, EPISODE_ID, EPISODE_KEYS));
  } catch {
    return parseOptionsRaw(null);
  }
}

/**
 * Saves what changed. The file is read again first and only the options that differ from what is saved are
 * written, in `scope` (every episode by default, or this one alone), so the launcher and the game never overwrite
 * each other's changes. An option only this episode has always goes in its own section. Returns false when the
 * store would not take it.
 */
export function writeOptions(store: Store | null, o: Options, scope: Scope = 'global'): boolean {
  if (!store) return false;
  try {
    let file = readOptionsFile(store, LEGACY, EPISODE_KEYS);
    const before = parseOptionsRaw(resolveRaw(file, EPISODE_ID, EPISODE_KEYS));
    for (const key of Object.keys(o) as (keyof Options)[]) {
      if (JSON.stringify(o[key]) !== JSON.stringify(before[key])) {
        file = setValue(file, scope, EPISODE_ID, key, o[key], EPISODE_KEYS);
      }
    }
    const saved = writeOptionsFile(store, file);
    store.setItem(
      OPTIONS_KEY,
      serialiseOptions(parseOptionsRaw(resolveRaw(file, EPISODE_ID, EPISODE_KEYS))),
    );
    return saved;
  } catch {
    return false;
  }
}

/** The sound style the player chose, or undefined while it is on Auto. */
export function audioChoice(o: Pick<Options, 'audio'>): AudioMode | undefined {
  return o.audio === 1 ? 'classic' : o.audio === 2 ? 'enhanced' : undefined;
}

/**
 * The version of the sound effects and of the music Auto picks: Enhanced, the reshaped effects and the songs. A
 * player who chose Classic (or Enhanced) has a stored choice, which these do not touch. Classic is still the
 * sound the game has always had, one step away in Options > Sound.
 */
export const SFX_VERSION_DEFAULT: AudioMode = 'enhanced';
export const MUSIC_VERSION_DEFAULT: AudioMode = 'enhanced';

/** The version of the music in use: the player's choice, or the default while it is on Auto. */
export function musicVersionOf(o: Pick<Options, 'musicVersion'>): AudioMode {
  return o.musicVersion === 1
    ? 'classic'
    : o.musicVersion === 2
      ? 'enhanced'
      : MUSIC_VERSION_DEFAULT;
}

/** The version of the sound effects in use: the player's choice, or the default while it is on Auto. */
export function sfxVersionOf(o: Pick<Options, 'sfxVersion'>): AudioMode {
  return o.sfxVersion === 1 ? 'classic' : o.sfxVersion === 2 ? 'enhanced' : SFX_VERSION_DEFAULT;
}

/** A meter level as a gain from 0 to 1. */
export const volumeOf = (level: number): number => level / METER_BLOCKS;

/** Whether motion is reduced: the Motion option, or the system setting when it is on System. */
export function reducedMotion(o: Pick<Options, 'motion'>, system: boolean): boolean {
  return o.motion === 1 || (o.motion === 0 && system);
}

const mod = (v: number, n: number): number => ((v % n) + n) % n;

const GLOBAL_STEP_KEYS: readonly GlobalKey[] = [
  'music',
  'sfx',
  'audio',
  'musicVersion',
  'sfxVersion',
  'text',
  'motion',
  'fullscreen',
  'awake',
  'density',
  'rumble',
];

/**
 * Changes one option by a step: meters clamp between 0 and 8, and choices wrap around. `wrapMeter`
 * lets Enter on a meter go from full back to silent, as in the design.
 */
export function stepOption(o: Options, key: SettingKey, delta: number, wrapMeter = false): Options {
  if (key === 'captions') return { ...o, captions: !o.captions };
  if (key === 'lab') return { ...o, lab: !o.lab };
  if (key === 'hapticsLab') return { ...o, hapticsLab: !o.hapticsLab };
  if (key === 'layout') return { ...o, layout: mod(o.layout + delta, LAYOUTS.length) };
  if (GLOBAL_STEP_KEYS.includes(key)) {
    return {
      ...o,
      ...stepGlobalOption(o, key as Exclude<GlobalKey, 'rumblePads'>, delta, wrapMeter),
    };
  }
  return o;
}
