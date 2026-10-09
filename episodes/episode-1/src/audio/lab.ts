// The sound lab's pure logic: item lists, slider specs and the tuned-versus-default diff.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AudioTune } from '@lieutenant-fizz/engine/audio-tune';
import { MASTER, type MasterTuning, type RoomProfile } from '@lieutenant-fizz/engine/master';
import type { MixShape } from '@lieutenant-fizz/engine/mix';
import {
  FIELD,
  PART_PAN,
  placeSound,
  type FieldTuning,
  type PartPan,
  type PartRole,
  type SoundAt,
} from '@lieutenant-fizz/engine/sound-field';
import { MIX } from './mix';
import { ROOMS } from './rooms';

/** A button in the lab: a sound, a track, a room or a mix state. */
export interface LabItem {
  id: string;
  label: string;
}

/** One button per name, in the order the table has them. */
export const labItems = (names: readonly string[]): LabItem[] =>
  names.map((id) => ({ id, label: id }));

/** Every number the lab can tune, as one value: the live tables, or a copy of them. */
export interface LabState {
  master: MasterTuning;
  field: FieldTuning;
  partPan: Record<PartRole, PartPan>;
  rooms: Record<string, RoomProfile>;
  mix: Record<string, MixShape>;
}

/** A deep copy of the tables as they are now. */
export const captureState = (
  live: LabState = { master: MASTER, field: FIELD, partPan: PART_PAN, rooms: ROOMS, mix: MIX },
): LabState => structuredClone(live);

/** The tables as they were when the page loaded, before anything could tune them. */
export const LAB_DEFAULTS: LabState = captureState();

/** How a slider's value maps to its position: straight, or on a log scale (cutoffs in Hz). */
export type Scale = 'linear' | 'log';

export interface SliderSpec {
  /** A stable id, also the key of the slider's DOM node. */
  id: string;
  group: string;
  label: string;
  /** Where the value lives, from the top of `LabState` (and `AudioTune`), for example `['master', 'trim']`. */
  path: (string | number)[];
  min: number;
  max: number;
  step: number;
  unit: '' | 'dB' | 'Hz' | 's' | 'x';
  scale?: Scale;
  /** True when applying the value is heavy (it restarts the music or rebuilds a room), so wait for the release. */
  onRelease?: boolean;
}

const S = (
  group: string,
  label: string,
  path: SliderSpec['path'],
  min: number,
  max: number,
  step: number,
  unit: SliderSpec['unit'] = '',
  extra: Partial<SliderSpec> = {},
): SliderSpec => ({
  id: path.join('.'),
  group,
  label,
  path,
  min,
  max,
  step,
  unit,
  ...extra,
});

/** The sliders of the master chain: output trim, the compressor, the limiter and the EQ shelves. */
export const MASTER_SLIDERS: readonly SliderSpec[] = [
  S('Master', 'Trim', ['master', 'trim'], 0, 1.2, 0.01),
  S('Master', 'Comp threshold', ['master', 'comp', 'threshold'], -60, 0, 1, 'dB'),
  S('Master', 'Comp ratio', ['master', 'comp', 'ratio'], 1, 20, 0.5, 'x'),
  S('Master', 'Comp knee', ['master', 'comp', 'knee'], 0, 40, 1, 'dB'),
  S('Master', 'Limiter threshold', ['master', 'limiter', 'threshold'], -12, 0, 0.5, 'dB'),
  S('Master', 'Low shelf', ['master', 'lowShelf', 'gain'], -12, 12, 0.5, 'dB'),
  S('Master', 'Presence', ['master', 'presence', 'gain'], -12, 12, 0.5, 'dB'),
  S('Master', 'High shelf', ['master', 'highShelf', 'gain'], -12, 12, 0.5, 'dB'),
];

/** The sound-effect field: how wide a sound pans, how far it carries and how quiet it can get. */
export const FIELD_SLIDERS: readonly SliderSpec[] = [
  S('Effect field', 'Width', ['field', 'width'], 0, 1, 0.05),
  S('Effect field', 'Full-level distance', ['field', 'near'], 0, 3, 0.1),
  S('Effect field', 'Fall-off per distance', ['field', 'slope'], 0, 1, 0.05),
  S('Effect field', 'Floor', ['field', 'floor'], 0, 1, 0.05),
];

/** The pans of the music parts. A new pan restarts the music, so it applies on release. */
export const PAN_SLIDERS: readonly SliderSpec[] = (
  ['lead', 'counter', 'bell', 'hats', 'perc'] as const
)
  .map((role) => S('Music pans', role, ['partPan', role], -1, 1, 0.05, '', { onRelease: true }))
  .concat([
    S('Music pans', 'arp left', ['partPan', 'arp', 0], -1, 1, 0.05, '', { onRelease: true }),
    S('Music pans', 'arp right', ['partPan', 'arp', 1], -1, 1, 0.05, '', { onRelease: true }),
  ]);

/** The sliders of one room: its sends, length and colour. A room is rebuilt, so these apply on release. */
export const roomSliders = (room: string): SliderSpec[] => {
  const g = `Room: ${room}`;
  const r = (
    label: string,
    key: string,
    min: number,
    max: number,
    step: number,
    unit: SliderSpec['unit'] = '',
    extra: Partial<SliderSpec> = {},
  ): SliderSpec =>
    S(g, label, ['rooms', room, key], min, max, step, unit, { onRelease: true, ...extra });
  return [
    r('Effects send', 'sfxSend', 0, 0.6, 0.01),
    r('Music send', 'musicSend', 0, 0.4, 0.01),
    r('Length', 'seconds', 0.1, 4, 0.1, 's'),
    r('Damping', 'damping', 0, 1, 0.05),
    r('Send low-pass', 'lpf', 1000, 16000, 100, 'Hz', { scale: 'log' }),
  ];
};

/** The sliders of one mix state: its cutoff and gain. Cheap and glided, so they apply as they move. */
export const mixSliders = (state: string): SliderSpec[] => [
  S(`Mix: ${state}`, 'Cutoff', ['mix', state, 'lpf'], 100, 20000, 100, 'Hz', { scale: 'log' }),
  S(`Mix: ${state}`, 'Gain', ['mix', state, 'gain'], 0, 1.2, 0.01),
];

/** Every slider for a given room and mix state. */
export const allSliders = (room: string, mixState: string): SliderSpec[] => [
  ...MASTER_SLIDERS,
  ...FIELD_SLIDERS,
  ...PAN_SLIDERS,
  ...roomSliders(room),
  ...mixSliders(mixState),
];

/** Reads the number at a path, or undefined if the table does not have one there. */
export function readPath(root: unknown, path: readonly (string | number)[]): number | undefined {
  let at: unknown = root;
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return undefined;
    at = (at as Record<string | number, unknown>)[key];
  }
  return typeof at === 'number' ? at : undefined;
}

/** The decimals a step needs, so a value can be rounded without float noise (0.05 -> 2). */
const decimals = (step: number): number => {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
};

/** Keeps a value inside the slider's range and on its step, with no float noise. */
export function snap(spec: SliderSpec, value: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const stepped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  return Number(
    Math.min(spec.max, stepped).toFixed(Math.max(decimals(spec.step), decimals(spec.min))),
  );
}

/** The `<input type=range>` attributes for a slider: log sliders move over 0 to 1 and map with `fromPosition`. */
export function inputAttrs(spec: SliderSpec): { min: number; max: number; step: number } {
  return spec.scale === 'log'
    ? { min: 0, max: 1, step: 0.001 }
    : { min: spec.min, max: spec.max, step: spec.step };
}

/** The input position for a value. */
export function toPosition(spec: SliderSpec, value: number): number {
  if (spec.scale !== 'log') return value;
  const v = Math.min(spec.max, Math.max(spec.min, value));
  return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
}

/** The value for an input position, snapped to the step. */
export function fromPosition(spec: SliderSpec, pos: number): number {
  if (spec.scale !== 'log') return snap(spec, pos);
  return snap(spec, spec.min * Math.pow(spec.max / spec.min, Math.min(1, Math.max(0, pos))));
}

/** The text beside a slider: the value with its unit. */
export function formatValue(spec: SliderSpec, value: number): string {
  const n = spec.unit === 'Hz' && value >= 1000 ? `${(value / 1000).toFixed(1)} k` : String(value);
  return spec.unit ? `${n} ${spec.unit}` : n;
}

/** Puts a value into a (possibly nested) `AudioTune` patch. */
function setPath(
  patch: Record<string, unknown>,
  path: readonly (string | number)[],
  value: unknown,
): void {
  let at = patch;
  for (let i = 0; i < path.length - 1; i++) {
    const key = String(path[i]);
    at = (at[key] ??= {}) as Record<string, unknown>;
  }
  at[String(path[path.length - 1])] = value;
}

/**
 * The patch that sets one slider to a value. The arpeggio's pan is a pair, so a patch for one side
 * carries the other side from `state`.
 */
export function patchFor(spec: SliderSpec, value: number, state: LabState): AudioTune {
  const patch: Record<string, unknown> = {};
  if (spec.path[0] === 'partPan' && spec.path.length === 3) {
    const role = spec.path[1] as PartRole;
    const pair = [...(state.partPan[role] as readonly [number, number])] as [number, number];
    pair[spec.path[2] as 0 | 1] = value;
    setPath(patch, ['partPan', role], pair);
  } else setPath(patch, spec.path, value);
  return patch as AudioTune;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Collects the leaves of `to` that differ from `from`. Numbers are leaves; so is a pan pair. */
function diffNode(from: unknown, to: unknown): unknown {
  if (typeof to !== 'object' || to === null || Array.isArray(to))
    return same(from, to) ? undefined : to;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(to)) {
    const d = diffNode((from as Record<string, unknown> | undefined)?.[key], value);
    if (d !== undefined) out[key] = d;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The values of `to` that differ from `from`, as an `AudioTune` that `__lf.debugAudioTune` accepts.
 * `tuneDiff(defaults, current)` is what to copy to the developer; `tuneDiff(current, defaults)` is
 * the patch that puts everything back.
 */
export function tuneDiff(from: LabState, to: LabState): AudioTune {
  return (diffNode(from, to) ?? {}) as AudioTune;
}

/** The text 'copy as JSON' puts on the clipboard: only the values that moved, two-space indented. */
export const tuneJson = (diff: AudioTune): string => JSON.stringify(diff, null, 2);

/** How many leaf values a diff holds (a pan pair counts as one), for the 'N changed' label. */
export function countChanges(diff: unknown): number {
  if (typeof diff !== 'object' || diff === null || Array.isArray(diff)) return 1;
  return Object.values(diff).reduce<number>((n, v) => n + countChanges(v), 0);
}

/** The farthest a sound is auditioned, in half-screens from the camera. */
export const MAX_DISTANCE = 4;

/**
 * Where an effect is auditioned: the pan as set (-1 to 1), and a loudness from `FIELD` for a sound
 * that far from the camera, the same way `placeSound` gives it in play. In play the pan is at most
 * `FIELD.width`, so a pan above that is wider than the game ever places a sound.
 */
export function auditionAt(pan: number, distance: number, field: FieldTuning = FIELD): SoundAt {
  const d = Math.min(MAX_DISTANCE, Math.max(0, distance));
  const { gain } = placeSound(0, d, { x: 0, y: 0 }, { w: 1, h: 1 }, field);
  return { pan: Math.min(1, Math.max(-1, pan)), gain };
}
