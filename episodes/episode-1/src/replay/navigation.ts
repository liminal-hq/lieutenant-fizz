// The small pure parts of the replay screen: clock text, where "next death" goes, the buttons held, the drift note.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { INPUT_BITS } from './names';
import type { Drift } from './replayer';
import type { Marker } from './timeline';

/** Ticks to the second. */
export const TICKS_PER_SECOND = 60;

/** How far before a death "next death" lands, so the player sees it coming: a second and a half. */
export const DEATH_LEAD = 90;

/** How far Left and Right on a controller or keyboard move the replay: five seconds. */
export const SKIP_TICKS = 300;

/** Ticks as minutes, seconds and tenths: "0:12.4". */
export function clockText(ticks: number): string {
  const t = Math.max(0, ticks) / TICKS_PER_SECOND;
  const minutes = Math.floor(t / 60);
  const seconds = t - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** The ticks "next death" and "previous death" go to: a lead before each death, never before the start. */
export function deathTargets(markers: readonly Marker[], startTick: number): number[] {
  return markers
    .filter((m) => m.kind === 'death')
    .map((m) => Math.max(startTick, m.tick - DEATH_LEAD))
    .sort((a, b) => a - b);
}

/**
 * The next target after `tick` going forward, or the last one before it going back; null when there is none.
 * A target within a tick of the current one does not count, so pressing again goes on to the next.
 */
export function nextTarget(targets: readonly number[], tick: number, dir: 1 | -1): number | null {
  if (dir === 1) return targets.find((t) => t > tick + 1) ?? null;
  for (let i = targets.length - 1; i >= 0; i--) if (targets[i]! < tick - 1) return targets[i]!;
  return null;
}

/** The buttons held in an input word, by name: "Right, Jump". Empty text for none. */
export function inputText(bits: number): string {
  return INPUT_BITS.filter((b) => bits & b.bit)
    .map((b) => b.name)
    .join(', ');
}

/** What is said when a replay stops matching the recording: where, what, and that the rest is the sim's own run. */
export function driftText(drift: Drift, startTick: number): string {
  const at = clockText(drift.tick - startTick);
  const what =
    drift.kind === 'pos'
      ? `Ben is at ${drift.replayed} where the recording has ${drift.recorded}`
      : drift.kind === 'st'
        ? `the count is ${drift.replayed} where the recording has ${drift.recorded}`
        : drift.kind === 'death'
          ? `the death is ${drift.replayed} where the recording has ${drift.recorded}`
          : `the clear is ${drift.replayed} where the recording has ${drift.recorded}`;
  return `From ${at} into this try the replay no longer matches the recording: ${what}. What follows is the game’s own run, not what the player saw.`;
}
