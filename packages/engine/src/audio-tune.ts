// Live tuning of the Enhanced sound: changes to MASTER, FIELD and PART_PAN, checked and applied.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
 */
export interface AudioTune {
  master?: DeepPartial<MasterTuning>;
  field?: Partial<FieldTuning>;
  partPan?: Partial<Record<PartRole, PartPan>>;
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
 * Applies a tuning to the live `MASTER`, `FIELD` and `PART_PAN`. Unknown keys, non-numbers and pans
 * outside -1 to 1 are skipped and listed in the report rather than thrown, so a typo in the console
 * does not stop the music.
 */
export function applyAudioTune(tune: AudioTune): TuneReport {
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
  return report;
}
