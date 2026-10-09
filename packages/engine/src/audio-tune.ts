// Live tuning of the Enhanced sound: changes to MASTER, FIELD and PART_PAN, checked and applied.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MixShape } from './mix';
import { MASTER, type MasterTuning } from './master';
import { FIELD, PART_PAN, type FieldTuning, type PartPan, type PartRole } from './sound-field';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * A change to the sound. Every key is optional and anything left out stays as it is:
 *
 * - `master`: any part of `MASTER`, for example `{ trim: 0.7, comp: { ratio: 3 } }`
 * - `field`: any part of `FIELD`, for example `{ width: 0.4, floor: 0.5 }`
 * - `partPan`: a pan for a role, a number or a `[left, right]` pair for the arpeggio, for example
 *   `{ bell: 0.2, arp: [-0.4, 0.4] }`
 * - `mix`: a change to a named mix state (`lpf` in Hz, `gain` linear) when the episode has one of
 *   that name, for example `{ pause: { lpf: 700 }, dialogue: { gain: 0.6 } }`
 */
export interface AudioTune {
  master?: DeepPartial<MasterTuning>;
  field?: Partial<FieldTuning>;
  partPan?: Partial<Record<PartRole, PartPan>>;
  mix?: Record<string, Partial<MixShape>>;
}

/** What `applyAudioTune` did: the values it set, and the paths it did not recognise or refused. */
export interface TuneReport {
  applied: string[];
  ignored: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Copies the numbers in `from` onto the same keys of `into`, noting what was set and what was not. */
function assign(
  into: Record<string, unknown>,
  from: Record<string, unknown>,
  path: string,
  report: TuneReport,
): void {
  for (const [key, value] of Object.entries(from)) {
    const here = `${path}.${key}`;
    const current = into[key];
    if (isRecord(current) && isRecord(value)) assign(current, value, here, report);
    else if (typeof current === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      into[key] = value;
      report.applied.push(here);
    } else report.ignored.push(here);
  }
}

const validPan = (v: unknown): v is PartPan => {
  const ok = (n: unknown): boolean => typeof n === 'number' && Math.abs(n) <= 1;
  return Array.isArray(v) ? v.length === 2 && v.every(ok) : ok(v);
};

/**
 * Applies a tuning to the live `MASTER`, `FIELD` and `PART_PAN`, and to the named mix states in
 * `mix`. Unknown keys, non-numbers, pans outside -1 to 1, cutoffs outside 20 to 20000 Hz and gains
 * outside 0 to 2 are skipped and listed in the report rather than thrown, so a typo in the console
 * does not stop the music.
 */
export function applyAudioTune(tune: AudioTune, mix?: Record<string, MixShape>): TuneReport {
  const report: TuneReport = { applied: [], ignored: [] };
  if (tune.master) assign(MASTER as never, tune.master as never, 'master', report);
  if (tune.field) assign(FIELD as never, tune.field as never, 'field', report);
  for (const [role, pan] of Object.entries(tune.partPan ?? {})) {
    const path = `partPan.${role}`;
    if (role in PART_PAN && validPan(pan)) {
      PART_PAN[role as PartRole] = pan;
      report.applied.push(path);
    } else report.ignored.push(path);
  }
  for (const [name, change] of Object.entries(tune.mix ?? {})) {
    const state = mix?.[name];
    for (const [key, value] of Object.entries(change ?? {})) {
      const path = `mix.${name}.${key}`;
      const ok =
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (key === 'lpf'
          ? value >= 20 && value <= 20000
          : key === 'gain' && value >= 0 && value <= 2);
      if (state && ok) {
        state[key as keyof MixShape] = value;
        report.applied.push(path);
      } else report.ignored.push(path);
    }
  }
  return report;
}
