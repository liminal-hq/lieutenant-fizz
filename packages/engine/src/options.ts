// The options every episode shares: sound, display and rumble, with their ranges, defaults and labels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { DEFAULT_STRENGTH, isStrength, MAX_STRENGTH } from './haptic-strength';
import { DEFAULT_DENSITY, DENSITY_COUNT } from './menu/density';
import { isPadModelKey } from './pad-model';

/** Blocks on a volume meter. A level of 0 is silent and 8 is full volume. */
export const METER_BLOCKS = 8;

/** The stored sound style: Auto follows the episode's default, the others are the player's choice. */
export const AUDIO_CHOICES = ['Auto', 'Classic', 'Enhanced'] as const;
export const TEXT_SIZES = ['Normal', 'Large'] as const;
export const MOTIONS = ['System', 'Reduced', 'Full'] as const;
/** The names of the stored Fullscreen values. */
export const FULLSCREEN_CHOICES = ['Auto', 'On', 'Off'] as const;
const FULLSCREEN_COUNT = FULLSCREEN_CHOICES.length;

/**
 * The options that belong to the app, not to a game: they mean the same in every episode, so the launcher can
 * change them for all, and an episode can still override any of them for itself (see `options-file.ts`).
 */
export interface GlobalOptions {
  /** Music volume, 0 to 8. */
  music: number;
  /** Sound effect volume, 0 to 8. */
  sfx: number;
  /** Sound style: 0 Auto (the episode's default), 1 Classic, 2 Enhanced. */
  audio: number;
  /** Which arrangement of the music plays: 0 Auto, 1 Classic, 2 Enhanced. */
  musicVersion: number;
  /** Which sound effects play: 0 Auto, 1 Classic, 2 Enhanced. */
  sfxVersion: number;
  /** Text size: 0 normal, 1 large (one scale step up). */
  text: number;
  /** Motion: 0 follows the system setting, 1 is reduced, 2 is full. */
  motion: number;
  /** Fullscreen when a run starts or resumes: 0 Auto (touch devices), 1 On, 2 Off. */
  fullscreen: number;
  /** Whether the screen is kept on while playing and watching. On by default. */
  awake: boolean;
  /** Menu row spacing on touch devices: 0 Compact, 1 Cozy, 2 Comfy (`menu/density.ts` has the heights). */
  density: number;
  /** Controller rumble strength: 0 Off, 1 Light, 2 Medium, 3 Strong (the phone's strength is in the touch settings). */
  rumble: number;
  /** Rumble strength per pad model, keyed by `vendorId:productId` (see `padModelKey`); a model with no entry uses `rumble`. */
  rumblePads: Record<string, number>;
}

export type GlobalKey = keyof GlobalOptions;

/** Every global option, in the order the settings screens list them. */
export const GLOBAL_KEYS: readonly GlobalKey[] = [
  'audio',
  'music',
  'sfx',
  'musicVersion',
  'sfxVersion',
  'text',
  'motion',
  'fullscreen',
  'awake',
  'density',
  'rumble',
  'rumblePads',
];

/** Volumes start at full, which is how the game sounded before there were options. */
export const DEFAULT_GLOBAL_OPTIONS: Readonly<GlobalOptions> = {
  music: METER_BLOCKS,
  sfx: METER_BLOCKS,
  audio: 0,
  musicVersion: 0,
  sfxVersion: 0,
  text: 0,
  motion: 0,
  fullscreen: 0,
  awake: true,
  density: DEFAULT_DENSITY,
  rumble: DEFAULT_STRENGTH,
  rumblePads: {},
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

/** The global options in a stored record; any missing or invalid field falls back to its default. */
export function parseGlobalOptions(raw: Readonly<Record<string, unknown>> | null): GlobalOptions {
  const d = DEFAULT_GLOBAL_OPTIONS;
  if (!raw) return { ...d, rumblePads: {} };
  return {
    music: int(raw['music'], 0, METER_BLOCKS, d.music),
    sfx: int(raw['sfx'], 0, METER_BLOCKS, d.sfx),
    audio: int(raw['audio'], 0, AUDIO_CHOICES.length - 1, d.audio),
    musicVersion: int(raw['musicVersion'], 0, AUDIO_CHOICES.length - 1, d.musicVersion),
    sfxVersion: int(raw['sfxVersion'], 0, AUDIO_CHOICES.length - 1, d.sfxVersion),
    text: int(raw['text'], 0, TEXT_SIZES.length - 1, d.text),
    motion: int(raw['motion'], 0, MOTIONS.length - 1, d.motion),
    fullscreen: int(raw['fullscreen'], 0, FULLSCREEN_COUNT - 1, d.fullscreen),
    awake: typeof raw['awake'] === 'boolean' ? raw['awake'] : d.awake,
    density: int(raw['density'], 0, DENSITY_COUNT - 1, d.density),
    rumble: isStrength(raw['rumble']) ? raw['rumble'] : d.rumble,
    rumblePads: parseRumblePads(raw['rumblePads']),
  };
}

/** The number of values a choice option cycles through. */
const CHOICES: Partial<Record<GlobalKey, number>> = {
  audio: AUDIO_CHOICES.length,
  musicVersion: AUDIO_CHOICES.length,
  sfxVersion: AUDIO_CHOICES.length,
  text: TEXT_SIZES.length,
  motion: MOTIONS.length,
  fullscreen: FULLSCREEN_COUNT,
  density: DENSITY_COUNT,
  rumble: MAX_STRENGTH + 1,
};

const mod = (v: number, n: number): number => ((v % n) + n) % n;

/**
 * Changes one global option by a step: meters clamp between 0 and 8, and choices wrap around. `wrapMeter` lets
 * a choose on a meter go from full back to silent. `rumblePads` has no step (it is set per pad model).
 */
export function stepGlobalOption(
  o: GlobalOptions,
  key: Exclude<GlobalKey, 'rumblePads'>,
  delta: number,
  wrapMeter = false,
): GlobalOptions {
  if (key === 'music' || key === 'sfx') {
    const next = wrapMeter ? mod(o[key] + delta, METER_BLOCKS + 1) : o[key] + delta;
    return { ...o, [key]: Math.min(METER_BLOCKS, Math.max(0, next)) };
  }
  if (key === 'awake') return { ...o, awake: !o.awake };
  return { ...o, [key]: mod(o[key] + delta, CHOICES[key] ?? 1) };
}
