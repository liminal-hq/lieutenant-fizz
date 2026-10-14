// The `.fizzsave` file: every episode's saves in one lossless bundle, and the rules for merging one back in.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The `format` every bundle names itself with. */
export const FIZZSAVE_FORMAT = 'fizzsave';

/** The bundle layout this build writes, and the newest it reads. */
export const FIZZSAVE_VERSION = 1;

/** The file extension, without the dot. */
export const FIZZSAVE_EXTENSION = 'fizzsave';

/** The largest bundle read, in bytes: a save is a few kilobytes, so anything bigger is not one. */
export const MAX_BUNDLE_BYTES = 1024 * 1024;

/** The largest single save accepted, in bytes of its stored text. */
export const MAX_SAVE_BYTES = 16 * 1024;

/** Where an episode keeps its saves: the store key of each. */
export interface EpisodeSaveKeys {
  id: string;
  keys: readonly string[];
}

/** The bundle as written: each episode's saves by store key, each the save's stored text as it was. */
export interface SaveBundle {
  format: typeof FIZZSAVE_FORMAT;
  version: number;
  app: string;
  exportedAt: string;
  episodes: Record<string, { saves: Record<string, string> }>;
}

type Reader = { getItem(key: string): string | null };

/** When a stored save was written, or undefined when it is not one the game would load (the check the launcher's Load screen uses). */
export function savedAtOf(json: string | null | undefined): number | undefined {
  if (!json || json.length > MAX_SAVE_BYTES) return undefined;
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const { at, progress } = raw as { at?: unknown; progress?: unknown };
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return undefined;
    return typeof at === 'number' && Number.isFinite(at) ? at : undefined;
  } catch {
    return undefined;
  }
}

/** The bundle of the saves these episodes have now, and how many that is. A save that cannot be read is left out. */
export function buildBundle(
  store: Reader,
  episodes: readonly EpisodeSaveKeys[],
  app: string,
  now: Date,
): { bundle: SaveBundle; count: number } {
  const out: SaveBundle['episodes'] = {};
  let count = 0;
  for (const episode of episodes) {
    const saves: Record<string, string> = {};
    for (const key of episode.keys) {
      let json: string | null = null;
      try {
        json = store.getItem(key);
      } catch {
        /* an unreadable key has no save */
      }
      if (json !== null && savedAtOf(json) !== undefined) {
        saves[key] = json;
        count++;
      }
    }
    if (Object.keys(saves).length > 0) out[episode.id] = { saves };
  }
  return {
    bundle: {
      format: FIZZSAVE_FORMAT,
      version: FIZZSAVE_VERSION,
      app,
      exportedAt: now.toISOString(),
      episodes: out,
    },
    count,
  };
}

/** The bundle as the bytes of the file (readable JSON). */
export function encodeBundle(bundle: SaveBundle): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(bundle, null, 2)}\n`);
}

/** The file name for a bundle written on this day: `lieutenant-fizz-saves-2026-10-14.fizzsave`. */
export const bundleName = (now: Date): string =>
  `lieutenant-fizz-saves-${now.toISOString().slice(0, 10)}.${FIZZSAVE_EXTENSION}`;

export type ParsedBundle =
  { ok: true; bundle: SaveBundle } | { ok: false; reason: 'toolarge' | 'invalid' | 'newer' };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Reads a bundle's bytes. A file over the size limit, one that is not a bundle, and one written by a newer version
 * of the app (whose layout this build cannot know) are each refused, and nothing is read from them.
 */
export function parseBundle(bytes: Uint8Array): ParsedBundle {
  if (bytes.byteLength > MAX_BUNDLE_BYTES) return { ok: false, reason: 'toolarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!isObject(raw) || raw['format'] !== FIZZSAVE_FORMAT) return { ok: false, reason: 'invalid' };
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'invalid' };
  }
  if (version > FIZZSAVE_VERSION) return { ok: false, reason: 'newer' };
  const episodes = raw['episodes'];
  if (!isObject(episodes)) return { ok: false, reason: 'invalid' };
  const clean: SaveBundle['episodes'] = {};
  for (const [id, entry] of Object.entries(episodes)) {
    if (!isObject(entry) || !isObject(entry['saves'])) continue;
    const saves: Record<string, string> = {};
    for (const [key, text] of Object.entries(entry['saves'])) {
      if (typeof text === 'string') saves[key] = text;
    }
    clean[id] = { saves };
  }
  return {
    ok: true,
    bundle: {
      format: FIZZSAVE_FORMAT,
      version,
      app: typeof raw['app'] === 'string' ? raw['app'] : '',
      exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
      episodes: clean,
    },
  };
}

/** How far past now a save's time may be (the clock of another device is not exact) before it is not believed. */
export const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** What an import would do. */
export interface ImportPlan {
  /** The saves to write, by store key: each is newer than the one already there, or has none to replace. */
  writes: Record<string, string>;
  /** How many saves are written. */
  imported: number;
  /** Saves kept as they are because the one held is as new or newer. */
  skipped: number;
  /** Saves left out: an episode or slot this build does not have, or a save too big or not one the game would load. */
  ignored: number;
}

/**
 * Plans merging a bundle into the saves held now. Each slot is taken on its own, and the newest `at` wins (a tie keeps
 * what is held), so an old bundle never replaces newer play, and a save dated well past `now` is ignored. Only the keys the installed episodes keep their saves
 * under are used, whatever the file says.
 */
export function planImport(
  store: Reader,
  bundle: SaveBundle,
  episodes: readonly EpisodeSaveKeys[],
  now: number = Date.now(),
): ImportPlan {
  const plan: ImportPlan = { writes: {}, imported: 0, skipped: 0, ignored: 0 };
  const known = new Map(episodes.map((e) => [e.id, new Set(e.keys)]));
  for (const [id, entry] of Object.entries(bundle.episodes)) {
    const keys = known.get(id);
    for (const [key, text] of Object.entries(entry.saves)) {
      const at = keys?.has(key) ? savedAtOf(text) : undefined;
      // A time well in the future would win every later merge, so it is not a save worth keeping.
      if (at === undefined || at > now + FUTURE_SLACK_MS) {
        plan.ignored++;
        continue;
      }
      let held: string | null = null;
      try {
        held = store.getItem(key);
      } catch {
        /* an unreadable key holds nothing */
      }
      const heldAt = savedAtOf(held);
      if (heldAt !== undefined && heldAt >= at) {
        plan.skipped++;
      } else {
        plan.writes[key] = text;
        plan.imported++;
      }
    }
  }
  return plan;
}
