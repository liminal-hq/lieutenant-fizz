// The player's touch control settings: size, opacity, hand, haptic strength and moved controls, stored on this device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure, with no DOM: parsing, saving and turning the settings into a `TouchSpec` are unit-tested. The
// settings belong to the device and every episode shares them, so they live in the engine.

import { DEFAULT_STRENGTH, isStrength } from './haptic-strength';
import type { KeyValueStorage } from './storage';
import {
  CHROMELESS_LIFT,
  DEFAULT_TOUCH_SPEC,
  type EdgeOffset,
  type MovableId,
  type TouchSpec,
} from './touch-layout';

/** Storage key for the touch settings; the version lives inside the saved JSON. */
export const TOUCH_KEY = 'lf-touch-v1';

/** Control sizes: Small, Medium and Large. */
export const SIZES = ['S', 'M', 'L'] as const;
export type TouchSize = (typeof SIZES)[number];

/** The multiplier each size applies to every control and offset. */
export const SIZE_SCALE: Readonly<Record<TouchSize, number>> = { S: 0.85, M: 1, L: 1.2 };

/** The opacities the controls can have in play, in percent. */
export const OPACITIES = [40, 60, 85, 100] as const;

export interface TouchSettings {
  size: TouchSize;
  /** Opacity of the controls in play, in percent (one of {@link OPACITIES}). */
  opacity: number;
  leftHanded: boolean;
  /**
   * How strong the phone's haptics are: 0 Off, 1 Light, 2 Medium, 3 Strong (see `haptic-strength.ts`). It is
   * a device setting like the others here, and the Haptics screen is where it is changed.
   */
  hapticStrength: number;
  /** Controls moved from their default place; a missing control is where it starts. */
  pos: Partial<Record<MovableId, EdgeOffset>>;
}

export const DEFAULT_TOUCH_SETTINGS: Readonly<TouchSettings> = {
  size: 'M',
  opacity: 85,
  leftHanded: false,
  hapticStrength: DEFAULT_STRENGTH,
  pos: {},
};

const MOVABLE: readonly MovableId[] = ['dpad', 'jump', 'pogo', 'fire'];
/** The largest stored offset, in spec pixels; placement clamps well inside this on every screen. */
const MAX_OFFSET = 2000;

const defaults = (): TouchSettings => ({ ...DEFAULT_TOUCH_SETTINGS, pos: {} });

const offset = (v: unknown): EdgeOffset | null => {
  if (typeof v !== 'object' || v === null) return null;
  const { side, bottom } = v as Record<string, unknown>;
  if (typeof side !== 'number' || typeof bottom !== 'number') return null;
  if (!Number.isFinite(side) || !Number.isFinite(bottom)) return null;
  if (side < 0 || side > MAX_OFFSET || bottom < 0 || bottom > MAX_OFFSET) return null;
  return { side: Math.round(side), bottom: Math.round(bottom) };
};

/** The nearest step; a value halfway between two steps takes the lower one. */
const snapOpacity = (v: unknown, fallback: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  let best: number = OPACITIES[0];
  for (const o of OPACITIES) if (Math.abs(o - v) < Math.abs(best - v)) best = o;
  return best;
};

/**
 * The stored strength. Settings saved before there were strengths kept a `haptics` boolean: false reads
 * as Off and anything else as the default. A `hapticStrength` that is there but not 0 to 3 is Strong.
 */
const storedStrength = (raw: Record<string, unknown>): number => {
  const v = raw['hapticStrength'];
  if (v !== undefined) return isStrength(v) ? v : DEFAULT_STRENGTH;
  return raw['haptics'] === false ? 0 : DEFAULT_STRENGTH;
};

/** Parses stored settings; anything missing or invalid falls back to its default, and an unknown version to all defaults. */
export function parseTouchSettings(json: string | null): TouchSettings {
  const d = defaults();
  try {
    const raw = (json ? JSON.parse(json) : null) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return d;
    const pos: TouchSettings['pos'] = {};
    const stored = raw['pos'];
    if (typeof stored === 'object' && stored !== null) {
      for (const id of MOVABLE) {
        const o = offset((stored as Record<string, unknown>)[id]);
        if (o) pos[id] = o;
      }
    }
    return {
      size: SIZES.includes(raw['size'] as TouchSize) ? (raw['size'] as TouchSize) : d.size,
      opacity: snapOpacity(raw['opacity'], d.opacity),
      leftHanded: typeof raw['leftHanded'] === 'boolean' ? raw['leftHanded'] : d.leftHanded,
      hapticStrength: storedStrength(raw),
      pos,
    };
  } catch {
    return d;
  }
}

/** The JSON to store: the version and the known fields only. */
export function serialiseTouchSettings(s: TouchSettings): string {
  return JSON.stringify({
    v: 1,
    size: s.size,
    opacity: s.opacity,
    leftHanded: s.leftHanded,
    hapticStrength: s.hapticStrength,
    pos: s.pos,
  });
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Writer = Pick<KeyValueStorage, 'setItem'>;

/** Reads the settings from storage; a missing, unreadable or invalid entry gives the defaults. Never writes. */
export function readTouchSettings(store: Reader | null): TouchSettings {
  try {
    return parseTouchSettings(store?.getItem(TOUCH_KEY) ?? null);
  } catch {
    return defaults();
  }
}

/** Saves the settings; false when there is no storage or it refuses (the settings still apply this session). */
export function writeTouchSettings(store: Writer | null, s: TouchSettings): boolean {
  try {
    store?.setItem(TOUCH_KEY, serialiseTouchSettings(s));
    return !!store;
  } catch {
    return false;
  }
}

/**
 * The placement spec for these settings: the size, the hand and the moved controls. With the browser's
 * bars gone (`chromeless`) the default places are lifted; moved controls keep their stored offsets.
 */
export function touchSpec(
  s: TouchSettings,
  base: TouchSpec = DEFAULT_TOUCH_SPEC,
  chromeless = false,
): TouchSpec {
  return {
    ...base,
    scale: SIZE_SCALE[s.size],
    leftHanded: s.leftHanded,
    moved: { ...s.pos },
    lift: chromeless ? CHROMELESS_LIFT : base.lift,
  };
}

/** The settings with one control moved. */
export function withPosition(s: TouchSettings, id: MovableId, off: EdgeOffset): TouchSettings {
  return { ...s, pos: { ...s.pos, [id]: { side: off.side, bottom: off.bottom } } };
}

/** The settings with every control back in its default place. */
export function resetPositions(s: TouchSettings): TouchSettings {
  return { ...s, pos: {} };
}
