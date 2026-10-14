// The launcher's side of the shared options: the app-wide values, read from and saved to the options file.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  METER_BLOCKS,
  parseGlobalOptions,
  type GlobalOptions,
} from '@lieutenant-fizz/engine/options';
import {
  clearGlobal,
  readOptionsFile,
  setValue,
  writeOptionsFile,
  type OptionsFile,
} from '@lieutenant-fizz/engine/options-file';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import type { EpisodeInfo } from './catalog';

/** What the launcher needs to read the options file: where older builds kept each episode's options, and the options only an episode has. */
export interface OptionsSource {
  legacy: readonly { episode: string; key: string }[];
  ownKeys: readonly string[];
}

/** The source from what the episodes' builds wrote out. An episode with no options info has none to carry over. */
export function optionsSourceOf(infos: Iterable<EpisodeInfo | undefined>): OptionsSource {
  const legacy: { episode: string; key: string }[] = [];
  const ownKeys = new Set<string>();
  for (const info of infos) {
    if (!info?.options) continue;
    legacy.push({ episode: info.options.episode, key: info.options.legacyKey });
    for (const key of info.options.ownKeys) ownKeys.add(key);
  }
  return { legacy, ownKeys: [...ownKeys] };
}

type Reader = Pick<KeyValueStorage, 'getItem'>;
type Store = Pick<KeyValueStorage, 'getItem' | 'setItem'>;

/** The file as saved, or carried over from an older build's options when there is none yet. */
export function readFile(store: Reader | null, source: OptionsSource): OptionsFile {
  return readOptionsFile(store, source.legacy, source.ownKeys);
}

/** The app-wide options: the global values, with the defaults for what has none. */
export function readGlobal(store: Reader | null, source: OptionsSource): GlobalOptions {
  return parseGlobalOptions(readFile(store, source).global);
}

/**
 * Saves one app-wide value, keeping every other value in the file. The file is read again first, so a change a
 * game saved a moment ago is not overwritten. Returns false when the store would not take it.
 */
export function writeGlobal(
  store: Store | null,
  source: OptionsSource,
  key: string,
  value: unknown,
): boolean {
  if (!store) return false;
  try {
    const file = setValue(readFile(store, source), 'global', '', key, value, source.ownKeys);
    return writeOptionsFile(store, file);
  } catch {
    return false;
  }
}

/** Puts these app-wide options back to their defaults (their values are dropped from the file). */
export function resetGlobal(
  store: Store | null,
  source: OptionsSource,
  keys: readonly string[],
): boolean {
  if (!store) return false;
  try {
    return writeOptionsFile(store, clearGlobal(readFile(store, source), keys));
  } catch {
    return false;
  }
}

/** A meter level as a volume from 0 to 1. */
export const volumeOf = (level: number): number => level / METER_BLOCKS;
