// The launcher's stops (each episode, then App settings) and what the launcher knows of an episode's saves.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { LaunchSlot } from '@lieutenant-fizz/engine/launch';
import type { SlotRow } from '@lieutenant-fizz/engine/menu/slot-row';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import type { DemoItem } from './demo';
import { readProgress, slotRowOf, type OverworldData } from './slot-info';

/** One entry of `site/episodes.json`: the list the website and the launcher share. */
export interface EpisodeEntry {
  id: string;
  number: number;
  title?: string;
  status: 'playable' | 'coming-soon';
}

export interface EpisodesFile {
  episodes: readonly EpisodeEntry[];
}

/** A stop of the carousel. */
export type Stop =
  | {
      kind: 'episode';
      id: string;
      number: number;
      /** Empty for an episode whose title is not announced. */
      title: string;
      playable: boolean;
    }
  | { kind: 'app' };

/** The stops in order: every episode, then App settings. */
export function stopsOf(file: EpisodesFile): readonly Stop[] {
  const episodes: Stop[] = [...file.episodes]
    .sort((a, b) => a.number - b.number)
    .map((e) => ({
      kind: 'episode',
      id: e.id,
      number: e.number,
      title: e.title ?? '',
      playable: e.status === 'playable',
    }));
  return [...episodes, { kind: 'app' }];
}

/**
 * What the launcher needs of a playable episode and cannot import from its code, written out by
 * `scripts/build-launcher-art.ts`: the page that runs it and where its saves are kept.
 */
/** Ben's frames side by side: two of running, one in the air and one shooting. */
export interface RunnerArt {
  src: string;
  width: number;
  height: number;
  frames: number;
}

/** One picture of a scene: how fast it scrolls compared with the ground, and whether it tiles up as well (the stars). */
export interface SceneLayerInfo {
  src: string;
  speed: number;
  field?: boolean;
}

/** The scenery behind the menu, as pictures the build script wrote out, back to front. */
/** What Ben meets along the ground: the things (see `demo.ts`) and the sheet of their pictures, `cells` cells of `cell` pixels. */
export interface SceneDemo {
  items: readonly DemoItem[];
  sheet: { src: string; cell: number; cells: number };
}

export interface SceneInfo {
  width: number;
  height: number;
  /** Where the ground starts, from the bottom, in scene pixels. */
  ground: number;
  /** The colour of the sky's top row, which the page continues up to the top. */
  skyTop: string;
  ben: boolean;
  demo?: SceneDemo;
  layers: readonly SceneLayerInfo[];
}

export interface EpisodeInfo {
  scene?: SceneInfo;
  runner?: RunnerArt;
  /** Ben's poses on the title, side by side: each `width` wide, in the order of `poses`. */
  titleBen?: { src: string; width: number; height: number; poses: readonly string[] };
  page: string;
  /** The words of the episode's wordmark. */
  card?: { kicker: string; words: readonly string[]; episode: string; name: string };
  /** Where the episode's options are kept: its name in the options file, its old key and the options only it has. */
  options?: { episode: string; legacyKey: string; ownKeys: readonly string[] };
  saves: {
    auto: string;
    slots: readonly string[];
    /** The key of the episode's quick-save, if it has one. */
    quick?: string;
    /** The overworld the slots' thumbnails and places come from, relative to the episode's folder. */
    overworld?: string;
    /** How many levels the episode has, for the cleared pips. */
    levels?: number;
    /** The names of the overworld's areas, by area id. */
    areas?: readonly string[];
  };
}

/** One save the launcher found: where it is and when it was written. */
export interface SaveEntry {
  slot: LaunchSlot;
  at: number;
  /** The slot as the game's Load game screen draws it, when the episode says enough to draw one. */
  row?: SlotRow;
}

/** The saves an episode has, and which is newest (what Continue loads). */
export interface SaveSummary {
  entries: readonly SaveEntry[];
  newest: LaunchSlot | undefined;
}

export const NO_SAVES: SaveSummary = { entries: [], newest: undefined };

/** `Autosave`, `Slot 2` or `Quick save`. */
export const slotLabel = (slot: LaunchSlot): string =>
  slot === 'auto' ? 'Autosave' : slot === 'quick' ? 'Quick save' : `Slot ${slot}`;

/**
 * The saves an episode has. Only what the Load game screen shows is read: the game itself checks a save in full when
 * it loads one. Like the game, the newest is the latest `at`, and a tie goes to the later slot. With the overworld,
 * each save also gets its row (thumbnail, place, pips and numbers) as the game draws it.
 */
export function readSaves(
  store: Pick<KeyValueStorage, 'getItem'>,
  info: EpisodeInfo,
  overworld?: OverworldData,
): SaveSummary {
  const keys: [LaunchSlot, string][] = [
    ['auto', info.saves.auto],
    ...info.saves.slots.map((key, i): [LaunchSlot, string] => [(i + 1) as LaunchSlot, key]),
    ...(info.saves.quick ? [['quick', info.saves.quick] as [LaunchSlot, string]] : []),
  ];
  const entries: SaveEntry[] = [];
  const ctx = {
    levels: info.saves.levels ?? 0,
    areas: info.saves.areas ?? [],
    ...(overworld ? { overworld } : {}),
  };
  for (const [slot, key] of keys) {
    let json: string | null = null;
    try {
      json = store.getItem(key);
    } catch {
      /* an unreadable store has no saves */
    }
    const progress = readProgress(json);
    if (!progress) continue;
    entries.push({
      slot,
      at: progress.at,
      ...(ctx.levels > 0 ? { row: slotRowOf(slot, progress, ctx) } : {}),
    });
  }
  let newest: SaveEntry | undefined;
  for (const e of entries) if (!newest || e.at >= newest.at) newest = e;
  return { entries, newest: newest?.slot };
}

/** A short date such as `Wed, Oct. 7`, as the game writes it. */
export function formatSaved(at: number, timeZone?: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
