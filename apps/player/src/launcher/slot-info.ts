// What the launcher shows for a save: the same row as the game's Load screen, built from the save and the overworld.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { LaunchSlot } from '@lieutenant-fizz/engine/launch';
import { thumbDataUrl, type ThumbPalette } from '@lieutenant-fizz/engine/menu/overworld-thumb';
import type { SlotRow } from '@lieutenant-fizz/engine/menu/slot-row';
import {
  clearedCount,
  formatDate,
  formatPlayed,
  slotBrief,
  slotDetail,
  slotName,
  slotTitle,
  type SlotSummary,
} from '@lieutenant-fizz/engine/menu/slot-text';

/** The overworld the thumbnails and the places come from, as the build script wrote it out. */
export interface OverworldData {
  w: number;
  h: number;
  cells: Uint8Array;
  /** The area id of each tile, row 0 at the south. */
  areas: Uint8Array;
  palette: ThumbPalette;
}

const fromBase64 = (text: string): Uint8Array => {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The overworld from its JSON, or undefined when it is not the shape the build script writes. */
export function parseOverworld(json: unknown): OverworldData | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const o = json as Record<string, unknown>;
  const { w, h, cells, areas, palette } = o;
  if (!isNumber(w) || !isNumber(h) || w <= 0 || h <= 0 || w * h > 1 << 20) return undefined;
  if (typeof cells !== 'string' || typeof areas !== 'string') return undefined;
  if (!palette || typeof palette !== 'object') return undefined;
  try {
    const c = fromBase64(cells);
    const a = fromBase64(areas);
    if (c.length !== w * h || a.length !== w * h) return undefined;
    return { w, h, cells: c, areas: a, palette: palette as ThumbPalette };
  } catch {
    return undefined;
  }
}

/** The numbers a save holds that its row shows. */
export interface SaveProgress {
  at: number;
  lives: number;
  score: number;
  doneMask: number;
  played: number;
  map?: { x: number; y: number };
}

/**
 * The progress in a stored save, or undefined when it is not one the game would load (an object with a finite `at`
 * and a `progress` object). Missing numbers read as zero: the game checks a save in full when it loads one.
 */
export function readProgress(json: string | null): SaveProgress | undefined {
  if (!json) return undefined;
  try {
    const raw = JSON.parse(json) as { at?: unknown; progress?: unknown } | null;
    if (!raw || typeof raw !== 'object' || !raw.progress || typeof raw.progress !== 'object') {
      return undefined;
    }
    if (!isNumber(raw.at)) return undefined;
    const p = raw.progress as Record<string, unknown>;
    const num = (v: unknown): number => (isNumber(v) ? v : 0);
    const m = p['map'] as { x?: unknown; y?: unknown } | undefined;
    return {
      at: raw.at,
      lives: num(p['lives']),
      score: num(p['score']),
      doneMask: num(p['doneMask']),
      played: num(p['played']),
      ...(m && isNumber(m.x) && isNumber(m.y) ? { map: { x: m.x, y: m.y } } : {}),
    };
  } catch {
    return undefined;
  }
}

/** What the row needs from the episode: how many levels it has and what its areas are called. */
export interface SlotContext {
  levels: number;
  areas: readonly string[];
  overworld?: OverworldData;
}

/** The area a map position is in, by name; the first area where there is no position or it is off the overworld, and none without the overworld. */
export function placeOf(ctx: SlotContext, map: { x: number; y: number } | undefined): string {
  const o = ctx.overworld;
  const first = ctx.areas[0] ?? '';
  // Without the overworld the place is not known, so none is claimed.
  if (!o) return '';
  if (!map) return first;
  const x = Math.floor(map.x);
  const y = Math.floor(map.y);
  if (x < 0 || y < 0 || x >= o.w || y >= o.h) return first;
  return ctx.areas[o.areas[y * o.w + x] ?? 0] ?? first;
}

/** The row for one save, as the game's Load game screen draws it. `thumb` makes the picture (none outside a page). */
export function slotRowOf(
  slot: LaunchSlot,
  progress: SaveProgress,
  ctx: SlotContext,
  thumb: (o: OverworldData, p: SaveProgress) => string = (o, p) =>
    thumbDataUrl({ w: o.w, h: o.h, cells: o.cells }, p.doneMask, p.map, o.palette),
): SlotRow {
  const summary: SlotSummary = {
    id: slot,
    name: slotName(slot),
    empty: false,
    readOnly: slot === 'auto',
    place: placeOf(ctx, progress.map),
    cleared: clearedCount(progress.doneMask, ctx.levels),
    total: ctx.levels,
    lives: progress.lives,
    score: progress.score,
    played: formatPlayed(progress.played),
    date: formatDate(progress.at),
  };
  const overworld = ctx.overworld;
  let picture: string | undefined;
  return {
    // Without a place (no overworld) the title is the slot's name alone.
    title: summary.place ? slotTitle(summary) : summary.name,
    detail: slotDetail(summary, 'load'),
    brief: slotBrief(summary, 'load'),
    // Made when the row is first drawn (the Load game screen), not when the saves are read at launch.
    get thumb(): string {
      if (picture === undefined) {
        try {
          picture = overworld ? thumb(overworld, progress) : '';
        } catch {
          picture = '';
        }
      }
      return picture;
    },
    empty: false,
    cleared: summary.cleared,
    total: summary.total,
  };
}
