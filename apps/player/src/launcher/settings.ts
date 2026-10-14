// The launcher's Settings: which options each tab holds, how a row reads, and what Reset puts back.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { STRENGTH_NAMES } from '@lieutenant-fizz/engine/haptic-strength';
import { densityName } from '@lieutenant-fizz/engine/menu/density';
import {
  AUDIO_CHOICES,
  DEFAULT_GLOBAL_OPTIONS,
  FULLSCREEN_CHOICES,
  MOTIONS,
  TEXT_SIZES,
  type GlobalKey,
  type GlobalOptions,
} from '@lieutenant-fizz/engine/options';

/** An app-wide option the Settings screen changes (`rumblePads` is set per pad model in a game's own screen). */
export type SettingKey = Exclude<GlobalKey, 'rumblePads'>;

export type SettingsTab = 'sound' | 'display' | 'controls';

/** The tabs, in order. */
export const SETTINGS_TABS: readonly SettingsTab[] = ['sound', 'display', 'controls'];

export const TAB_NAMES: Readonly<Record<SettingsTab, string>> = {
  sound: 'Sound',
  display: 'Display',
  controls: 'Controls',
};

/** What this device can do, which decides which rows exist. */
export interface SettingsCaps {
  /** The desktop app: its window has a fullscreen of its own to choose. */
  desktop: boolean;
  /** A touch screen: menu rows have a height to choose. */
  touch: boolean;
}

/** The options on a tab, in order. A row appears only where the device can do what it sets. */
export function tabKeys(tab: SettingsTab, caps: SettingsCaps): SettingKey[] {
  switch (tab) {
    case 'sound':
      return ['audio', 'music', 'sfx', 'musicVersion', 'sfxVersion'];
    case 'display':
      return [
        'text',
        'motion',
        ...(caps.desktop ? (['fullscreen'] as const) : []),
        'awake',
        ...(caps.touch ? (['density'] as const) : []),
      ];
    case 'controls':
      return ['rumble'];
  }
}

const LABELS: Readonly<Record<SettingKey, string>> = {
  audio: 'Style',
  music: 'Music',
  sfx: 'Effects',
  musicVersion: 'Music version',
  sfxVersion: 'Effects version',
  text: 'Text size',
  motion: 'Motion',
  fullscreen: 'Fullscreen',
  awake: 'Keep awake',
  density: 'Row spacing',
  rumble: 'Rumble',
};

export interface SettingRow {
  key: SettingKey;
  label: string;
  kind: 'meter' | 'choice';
  /** The value in words, for a choice. */
  value?: string;
  /** Lit blocks, 0 to 8, for a meter. */
  meter?: number;
}

const name = (names: readonly string[], index: number): string => names[index] ?? '';

/** How a row reads for these options. */
export function settingRow(key: SettingKey, o: GlobalOptions): SettingRow {
  const label = LABELS[key];
  switch (key) {
    case 'music':
    case 'sfx':
      return { key, label, kind: 'meter', meter: o[key] };
    case 'audio':
    case 'musicVersion':
    case 'sfxVersion':
      return { key, label, kind: 'choice', value: name(AUDIO_CHOICES, o[key]) };
    case 'text':
      return { key, label, kind: 'choice', value: name(TEXT_SIZES, o.text) };
    case 'motion':
      return { key, label, kind: 'choice', value: name(MOTIONS, o.motion) };
    case 'fullscreen':
      return { key, label, kind: 'choice', value: name(FULLSCREEN_CHOICES, o.fullscreen) };
    case 'awake':
      return { key, label, kind: 'choice', value: o.awake ? 'On' : 'Off' };
    case 'density':
      return { key, label, kind: 'choice', value: densityName(o.density) };
    case 'rumble':
      return { key, label, kind: 'choice', value: name(STRENGTH_NAMES, o.rumble) };
  }
}

/** The menu id of a setting's row. */
export const settingId = (key: SettingKey): `opt:${SettingKey}` => `opt:${key}`;

const KEYS = Object.keys(LABELS) as SettingKey[];

/** The setting a menu id names, or undefined when it is not a setting row. */
export function settingOf(id: string): SettingKey | undefined {
  if (!id.startsWith('opt:')) return undefined;
  const key = id.slice(4);
  return (KEYS as string[]).includes(key) ? (key as SettingKey) : undefined;
}

/** These options put back to their defaults. */
export function withDefaults(o: GlobalOptions, keys: readonly SettingKey[]): GlobalOptions {
  const next = { ...o };
  for (const key of keys) (next as Record<SettingKey, unknown>)[key] = DEFAULT_GLOBAL_OPTIONS[key];
  return next;
}
