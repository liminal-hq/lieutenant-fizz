// The options file: values for every episode at once, plus what one episode overrides for itself.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { KeyValueStorage } from './storage';

/** The store key. The version lives inside the saved JSON. */
export const OPTIONS_FILE_KEY = 'lf-options-v1';

/**
 * What is saved: `global` holds the app-wide values (every episode follows them), and `episodes` holds, for each
 * episode, what it overrides: a sparse record, and the options only that episode has (its own layout, captions).
 * Values are kept as plain JSON and checked by whoever reads them, so the file knows nothing about any option.
 */
export interface OptionsFile {
  v: 1;
  global: Record<string, unknown>;
  episodes: Record<string, Record<string, unknown>>;
}

export const EMPTY_OPTIONS_FILE: Readonly<OptionsFile> = { v: 1, global: {}, episodes: {} };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const recordsOf = (v: unknown): Record<string, Record<string, unknown>> => {
  const out: Record<string, Record<string, unknown>> = {};
  if (isRecord(v))
    for (const [id, section] of Object.entries(v)) if (isRecord(section)) out[id] = { ...section };
  return out;
};

/** The file in saved JSON; nothing, a version it does not know or something unreadable is an empty file. */
export function parseOptionsFile(json: string | null): OptionsFile {
  try {
    const raw: unknown = json ? JSON.parse(json) : null;
    if (!isRecord(raw) || raw['v'] !== 1) return { v: 1, global: {}, episodes: {} };
    return {
      v: 1,
      global: isRecord(raw['global']) ? { ...raw['global'] } : {},
      episodes: recordsOf(raw['episodes']),
    };
  } catch {
    return { v: 1, global: {}, episodes: {} };
  }
}

export const serialiseOptionsFile = (file: OptionsFile): string => JSON.stringify(file);

/** Where a change goes: to every episode, or to one episode only. */
export type Scope = 'global' | { episode: string };

/**
 * The values an episode sees: the global ones, then what it overrides on top. `episodeKeys` are the options only
 * that episode has, so they are read from its section alone and a global value of the same name is ignored.
 */
export function resolveRaw(
  file: OptionsFile,
  episode: string,
  episodeKeys: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file.global))
    if (!episodeKeys.includes(key)) out[key] = value;
  return { ...out, ...file.episodes[episode] };
}

/**
 * The file with one value set. An episode's own option always goes in its section, whatever the scope, since it
 * has no global value; any other goes to the scope asked for.
 */
export function setValue(
  file: OptionsFile,
  scope: Scope,
  episode: string,
  key: string,
  value: unknown,
  episodeKeys: readonly string[] = [],
): OptionsFile {
  if (scope === 'global' && !episodeKeys.includes(key)) {
    return { ...file, global: { ...file.global, [key]: value } };
  }
  const id = scope === 'global' ? episode : scope.episode;
  return { ...file, episodes: { ...file.episodes, [id]: { ...file.episodes[id], [key]: value } } };
}

/** The options an episode overrides (not counting the ones only it has): the rows to mark with a `*`. */
export function overriddenKeys(
  file: OptionsFile,
  episode: string,
  episodeKeys: readonly string[] = [],
): string[] {
  return Object.keys(file.episodes[episode] ?? {}).filter((k) => !episodeKeys.includes(k));
}

/** The file with an episode's overrides dropped (its own options stay). */
export function clearOverrides(
  file: OptionsFile,
  episode: string,
  episodeKeys: readonly string[] = [],
  keys?: readonly string[],
): OptionsFile {
  const section = file.episodes[episode];
  if (!section) return file;
  const kept = Object.fromEntries(
    Object.entries(section).filter(
      ([k]) => episodeKeys.includes(k) || (keys !== undefined && !keys.includes(k)),
    ),
  );
  return { ...file, episodes: { ...file.episodes, [episode]: kept } };
}

/** The file with these app-wide values dropped, which puts each back to its default. */
export function clearGlobal(file: OptionsFile, keys: readonly string[]): OptionsFile {
  return {
    ...file,
    global: Object.fromEntries(Object.entries(file.global).filter(([k]) => !keys.includes(k))),
  };
}

/** The file with every app-wide value dropped, which puts each back to its default (episodes' own overrides stay). */
export function resetGlobal(file: OptionsFile): OptionsFile {
  return { ...file, global: {} };
}

/** An episode's options as an older build saved them, to carry over once. */
export interface LegacyOptions {
  episode: string;
  /** The saved JSON of that episode's old options key, or null. */
  json: string | null;
}

/**
 * The file made from options saved the old way (one blob for each episode, `{v: 1, ...fields}`). The first
 * episode's app-wide values seed `global`; a later episode's value that differs from it becomes that episode's
 * override, so each episode plays as the player had it. Every episode's own options go in its section. A blob that
 * is not a version 1 record is ignored.
 */
export function migrateLegacy(
  legacy: readonly LegacyOptions[],
  episodeKeys: readonly string[] = [],
): OptionsFile {
  const file: OptionsFile = { v: 1, global: {}, episodes: {} };
  let seeded = false;
  for (const { episode, json } of legacy) {
    let raw: unknown;
    try {
      raw = json ? JSON.parse(json) : null;
    } catch {
      raw = null;
    }
    if (!isRecord(raw) || raw['v'] !== 1) continue;
    const own: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'v') continue;
      if (episodeKeys.includes(key)) own[key] = value;
      else if (!seeded) file.global[key] = value;
      else if (JSON.stringify(file.global[key]) !== JSON.stringify(value)) own[key] = value;
    }
    seeded = true;
    if (Object.keys(own).length > 0) file.episodes[episode] = own;
  }
  return file;
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Writer = Pick<KeyValueStorage, 'setItem'>;

/**
 * The saved file. When there is none yet, the options an older build saved are carried over, so nothing a player
 * chose is lost; nothing is written until the next change.
 */
export function readOptionsFile(
  store: Reader | null,
  legacy: readonly { episode: string; key: string }[] = [],
  episodeKeys: readonly string[] = [],
): OptionsFile {
  try {
    const saved = store?.getItem(OPTIONS_FILE_KEY) ?? null;
    if (saved !== null) return parseOptionsFile(saved);
    return migrateLegacy(
      legacy.map(({ episode, key }) => ({ episode, json: store?.getItem(key) ?? null })),
      episodeKeys,
    );
  } catch {
    return { v: 1, global: {}, episodes: {} };
  }
}

/** Whether the text saved is an options file from a newer version of the app, which this one must leave alone. */
function fromNewerVersion(saved: string | null): boolean {
  if (saved === null) return false;
  try {
    const raw: unknown = JSON.parse(saved);
    return isRecord(raw) && typeof raw['v'] === 'number' && raw['v'] > 1;
  } catch {
    return false;
  }
}

/**
 * Saves the file. Returns false when the store would not take it, or when the file held was written by a newer
 * version of the app (a downgrade must not overwrite what it cannot read: that is the player's options).
 */
export function writeOptionsFile(
  store: (Writer & Partial<Reader>) | null,
  file: OptionsFile,
): boolean {
  try {
    if (fromNewerVersion(store?.getItem?.(OPTIONS_FILE_KEY) ?? null)) return false;
    store?.setItem(OPTIONS_FILE_KEY, serialiseOptionsFile(file));
    return !!store;
  } catch {
    return false;
  }
}
