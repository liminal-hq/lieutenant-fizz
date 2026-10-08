// Golden snapshot of the Classic control patterns: the Undertone events every effect and track plays.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildVoice } from '@lieutenant-fizz/engine/audio';
import * as Undertone from '@liminal-hq/undertone';
import { Fraction, hasOnset, type Hap, type Pattern } from '@liminal-hq/undertone';
import type { ControlPatch } from '@liminal-hq/undertone';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MUSIC, SFX } from './patterns';

const CYCLES = 8;

/** Every onset over eight cycles as plain data. */
function events(p: Pattern<ControlPatch>): unknown[] {
  const haps: Hap<ControlPatch>[] = p.query({ begin: new Fraction(0), end: new Fraction(CYCLES) });
  return haps
    .filter((h) => hasOnset(h))
    .map((h) => ({
      at: h.part.begin.toNumber(),
      to: h.part.end.toNumber(),
      ...h.value,
    }))
    .sort((a, b) => a.at - b.at || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/**
 * The first cycle in full, so a change reads as a diff, plus a hash of all eight cycles, so a change
 * anywhere after the first cycle still fails the snapshot without a megabyte of events.
 */
function summary(p: Pattern<ControlPatch>): { events: number; cycle0: unknown[]; sha256: string } {
  const all = events(p);
  return {
    events: all.length,
    cycle0: all.filter((e) => (e as { at: number }).at < 1),
    sha256: createHash('sha256').update(JSON.stringify(all)).digest('hex'),
  };
}

describe('Classic control patterns', () => {
  it('builds every sound effect to the same Undertone events', () => {
    const out: Record<string, unknown> = {};
    for (const [name, voices] of Object.entries(SFX)) {
      out[name] = summary(
        Undertone.stack(...voices.map((v) => buildVoice(Undertone, v, 1, false))),
      );
    }
    expect(out).toMatchSnapshot();
  });

  it('builds every music track to the same Undertone events', () => {
    const out: Record<string, unknown> = {};
    for (const [name, track] of Object.entries(MUSIC)) {
      out[name] = summary(
        Undertone.stack(...track.parts.map((p) => buildVoice(Undertone, p, 1, true))),
      );
    }
    expect(out).toMatchSnapshot();
  });
});
