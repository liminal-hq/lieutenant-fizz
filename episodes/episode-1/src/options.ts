// Player options: volumes, sound style, captions, controls layout, text size and motion, saved on this device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  DEFAULT_STRENGTH,
  isStrength,
  MAX_STRENGTH,
} from '@lieutenant-fizz/engine/haptic-strength';
import { isPadModelKey } from '@lieutenant-fizz/engine/pad-model';
import type { AudioMode } from '@lieutenant-fizz/engine/sound-field';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import { DEFAULT_DENSITY, DENSITY_COUNT } from './menu-density';

/** Storage key for the options; the version lives inside the saved JSON. */
export const OPTIONS_KEY = 'lf-ep1-options-v1';

/** Blocks on a volume meter. A level of 0 is silent and 8 is full volume. */
export const METER_BLOCKS = 8;

export const LAYOUTS = ['Keen-style', 'Modern'] as const;
export const TEXT_SIZES = ['Normal', 'Large'] as const;
export const MOTIONS = ['System', 'Reduced', 'Full'] as const;
/** The stored sound style: Auto follows the game's default, the others are the player's choice. */
export const AUDIO_CHOICES = ['Auto', 'Classic', 'Enhanced'] as const;
/** How many fullscreen settings are stored (Auto, On, Off; the names are in `display-options.ts`). */
const FULLSCREEN_COUNT = 3;

export interface Options {
  /** Music volume, 0 to 8. */
  music: number;
  /** Sound effect volume, 0 to 8. */
  sfx: number;
  /** Sound style: 0 Auto (the game's default), 1 Classic, 2 Enhanced. */
  audio: number;
  /** Floating sound captions on or off. */
  captions: boolean;
  /** Which keyboard layout the hints and Controls table show: 0 Keen-style, 1 Modern. */
  layout: number;
  /** Text size: 0 normal, 1 large (one scale step up). */
  text: number;
  /** Motion: 0 follows the system setting, 1 is reduced, 2 is full. */
  motion: number;
  /** Whether the sound lab is available without `?debug`. Off by default. */
  lab: boolean;
  /** Controller rumble strength: 0 Off, 1 Light, 2 Medium, 3 Strong (the phone's strength is in the touch settings). */
  rumble: number;
  /** Rumble strength per pad model, keyed by `vendorId:productId` (see `padModelKey`); a model with no entry uses `rumble`, lowered to the model's own start. */
  rumblePads: Record<string, number>;
  /** Whether the haptics lab is available without `?debug`. Off by default. */
  hapticsLab: boolean;
  /** Fullscreen when a run starts or resumes: 0 Auto (touch devices), 1 On, 2 Off. */
  fullscreen: number;
  /** Whether the screen is kept on while playing and watching. On by default. */
  awake: boolean;
  /** Menu row spacing on touch devices: 0 Compact, 1 Cozy, 2 Comfy (`menu-density.ts` has the heights). */
  density: number;
}

/** The keys of {@link Options} the Options screen can change. */
export type SettingKey = Exclude<keyof Options, 'rumblePads'>;

/** Volumes start at full, which is how the game sounded before there were options. */
export const DEFAULT_OPTIONS: Readonly<Options> = {
  music: METER_BLOCKS,
  sfx: METER_BLOCKS,
  audio: 0,
  captions: true,
  layout: 0,
  text: 0,
  motion: 0,
  lab: false,
  rumble: DEFAULT_STRENGTH,
  rumblePads: {},
  hapticsLab: false,
  fullscreen: 0,
  awake: true,
  density: DEFAULT_DENSITY,
};

const int = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;

/** The per-model rumble levels in stored options: entries with a model key and a valid level, anything else left out. */
function parseRumblePads(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [key, level] of Object.entries(v)) {
      if (isPadModelKey(key) && isStrength(level)) out[key] = level;
    }
  }
  return out;
}

/** Parses stored options; any missing or invalid field falls back to its default. */
export function parseOptions(json: string | null): Options {
  const d = DEFAULT_OPTIONS;
  try {
    const raw = (json ? JSON.parse(json) : null) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return { ...d };
    return {
      music: int(raw['music'], 0, METER_BLOCKS, d.music),
      sfx: int(raw['sfx'], 0, METER_BLOCKS, d.sfx),
      audio: int(raw['audio'], 0, AUDIO_CHOICES.length - 1, d.audio),
      captions: typeof raw['captions'] === 'boolean' ? raw['captions'] : d.captions,
      layout: int(raw['layout'], 0, LAYOUTS.length - 1, d.layout),
      text: int(raw['text'], 0, TEXT_SIZES.length - 1, d.text),
      motion: int(raw['motion'], 0, MOTIONS.length - 1, d.motion),
      lab: typeof raw['lab'] === 'boolean' ? raw['lab'] : d.lab,
      rumble: isStrength(raw['rumble']) ? raw['rumble'] : d.rumble,
      rumblePads: parseRumblePads(raw['rumblePads']),
      hapticsLab: typeof raw['hapticsLab'] === 'boolean' ? raw['hapticsLab'] : d.hapticsLab,
      fullscreen: int(raw['fullscreen'], 0, FULLSCREEN_COUNT - 1, d.fullscreen),
      awake: typeof raw['awake'] === 'boolean' ? raw['awake'] : d.awake,
      density: int(raw['density'], 0, DENSITY_COUNT - 1, d.density),
    };
  } catch {
    return { ...d };
  }
}

export function serialiseOptions(o: Options): string {
  return JSON.stringify({ v: 1, ...o });
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Writer = Pick<KeyValueStorage, 'setItem'>;

export function readOptions(store: Reader | null): Options {
  try {
    return parseOptions(store?.getItem(OPTIONS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function writeOptions(store: Writer | null, o: Options): boolean {
  try {
    store?.setItem(OPTIONS_KEY, serialiseOptions(o));
    return !!store;
  } catch {
    return false;
  }
}

/** The sound style the player chose, or undefined while it is on Auto. */
export function audioChoice(o: Pick<Options, 'audio'>): AudioMode | undefined {
  return o.audio === 1 ? 'classic' : o.audio === 2 ? 'enhanced' : undefined;
}

/** A meter level as a gain from 0 to 1. */
export const volumeOf = (level: number): number => level / METER_BLOCKS;

/** Whether motion is reduced: the Motion option, or the system setting when it is on System. */
export function reducedMotion(o: Pick<Options, 'motion'>, system: boolean): boolean {
  return o.motion === 1 || (o.motion === 0 && system);
}

/** The number of values a choice option cycles through. */
const CHOICES: Partial<Record<SettingKey, number>> = {
  audio: AUDIO_CHOICES.length,
  captions: 2,
  lab: 2,
  hapticsLab: 2,
  fullscreen: FULLSCREEN_COUNT,
  awake: 2,
  density: DENSITY_COUNT,
  rumble: MAX_STRENGTH + 1,
  layout: LAYOUTS.length,
  text: TEXT_SIZES.length,
  motion: MOTIONS.length,
};

const mod = (v: number, n: number): number => ((v % n) + n) % n;

/**
 * Changes one option by a step: meters clamp between 0 and 8, and choices wrap around. `wrapMeter`
 * lets Enter on a meter go from full back to silent, as in the design.
 */
export function stepOption(o: Options, key: SettingKey, delta: number, wrapMeter = false): Options {
  if (key === 'music' || key === 'sfx') {
    const next = wrapMeter ? mod(o[key] + delta, METER_BLOCKS + 1) : o[key] + delta;
    return { ...o, [key]: Math.min(METER_BLOCKS, Math.max(0, next)) };
  }
  const n = CHOICES[key] ?? 1;
  if (key === 'captions') return { ...o, captions: !o.captions };
  if (key === 'lab') return { ...o, lab: !o.lab };
  if (key === 'hapticsLab') return { ...o, hapticsLab: !o.hapticsLab };
  if (key === 'awake') return { ...o, awake: !o.awake };
  return { ...o, [key]: mod(o[key] + delta, n) };
}
