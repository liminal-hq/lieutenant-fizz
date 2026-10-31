// The launcher's saves file: exporting every episode's saves to a `.fizzsave` and merging one back in.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { FileSaver } from '@lieutenant-fizz/engine/file-save';
import {
  FIZZSAVE_EXTENSION,
  MAX_BUNDLE_BYTES,
  buildBundle,
  bundleName,
  encodeBundle,
  parseBundle,
  planImport,
  type EpisodeSaveKeys,
} from '@lieutenant-fizz/engine/saves-bundle';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import type { EpisodeInfo } from './catalog';

/** The store key of every save each installed episode has (the autosave, the slots, then the quick-save). */
export function saveKeysOf(
  infos: Iterable<readonly [string, EpisodeInfo | undefined]>,
): EpisodeSaveKeys[] {
  const out: EpisodeSaveKeys[] = [];
  for (const [id, info] of infos) {
    if (info)
      out.push({
        id,
        keys: [
          info.saves.auto,
          ...info.saves.slots,
          ...(info.saves.quick ? [info.saves.quick] : []),
        ],
      });
  }
  return out;
}

export interface SavesDeps {
  store: Pick<KeyValueStorage, 'getItem' | 'setItem'>;
  /** Where files go and come from, or null where the page has none. */
  saver: FileSaver | null;
  episodes: readonly EpisodeSaveKeys[];
  /** The app's version, written into the file. */
  app: string;
  now(): Date;
  /** Writes the store out; false when that failed. */
  flush(): Promise<boolean>;
  /** The saves held changed: read them again. */
  refresh(): void;
}

const plural = (n: number): string => `${n} ${n === 1 ? 'save' : 'saves'}`;

/** What the player is told when the store would not take a write. */
export const IMPORT_NOT_SAVED = "Couldn't save the imported saves: storage is full or blocked";

/** Saves every episode's saves to a file the player chooses. Resolves what to tell them, or undefined when they closed the dialog. */
export async function exportSaves(deps: SavesDeps): Promise<string | undefined> {
  if (!deps.saver) return "Files can't be saved here";
  const now = deps.now();
  const { bundle, count } = buildBundle(deps.store, deps.episodes, deps.app, now);
  if (count === 0) return 'No saves to export';
  const outcome = await deps.saver.save(encodeBundle(bundle), bundleName(now), 'application/json');
  if (outcome === 'cancelled') return undefined;
  return outcome === 'saved' ? `Exported ${plural(count)}` : "Couldn't save the file";
}

/**
 * Merges a saves file the player chooses into the saves held: each slot takes the newest. Resolves what to tell them,
 * or undefined when they closed the dialog.
 */
export async function importSaves(deps: SavesDeps): Promise<string | undefined> {
  if (!deps.saver) return "Files can't be opened here";
  const opened = await deps.saver.open([FIZZSAVE_EXTENSION], MAX_BUNDLE_BYTES);
  if (opened.status === 'cancelled') return undefined;
  if (opened.status === 'toolarge') return 'That file is too big to be a saves file';
  if (opened.status === 'failed') return "Couldn't open the file";
  const parsed = parseBundle(opened.bytes);
  if (!parsed.ok) {
    if (parsed.reason === 'toolarge') return 'That file is too big to be a saves file';
    if (parsed.reason === 'newer') return 'That file is from a newer version of the app';
    return "That isn't a Fizz saves file";
  }
  const plan = planImport(deps.store, parsed.bundle, deps.episodes);
  try {
    for (const [key, text] of Object.entries(plan.writes)) deps.store.setItem(key, text);
  } catch {
    deps.refresh();
    return IMPORT_NOT_SAVED;
  }
  deps.refresh();
  if (plan.imported > 0 && !(await deps.flush())) return IMPORT_NOT_SAVED;
  if (plan.imported === 0 && plan.skipped === 0) return 'Nothing in that file could be used';
  const parts = [`Imported ${plural(plan.imported)}`];
  if (plan.skipped > 0) parts.push(`skipped ${plan.skipped} older`);
  if (plan.ignored > 0) parts.push(`ignored ${plan.ignored}`);
  return parts.join(', ');
}
