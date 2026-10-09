// Tests that Episode 1 captions map to effects and every music part parses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildVoice, evalMini, parseMini, type MiniEvent } from '@lieutenant-fizz/engine/audio';
import { PART_PAN, partPanAt, undertonePan } from '@lieutenant-fizz/engine/sound-field';
import * as Undertone from '@liminal-hq/undertone';
import { Fraction, hasOnset } from '@liminal-hq/undertone';
import { describe, expect, it } from 'vitest';
import { CAPTION_SFX, MUSIC, SFX } from './patterns';
import { CINE_TRACK, LEVELS } from '../story';
import { MORTIMER_STINGER } from '../stinger';

describe('audio patterns', () => {
  it('maps every caption sound to an existing effect', () => {
    for (const [text, sfx] of Object.entries(CAPTION_SFX)) {
      expect(SFX[sfx], `${text} -> ${sfx}`).toBeDefined();
    }
  });

  it('has a low sting for the stinger, tied to its sound caption', () => {
    const voices = SFX['stinger'] ?? [];
    expect(voices.length).toBeGreaterThanOrEqual(3);
    expect(CAPTION_SFX[MORTIMER_STINGER.caption]).toBe('stinger');
    for (const v of voices) {
      expect(v.g).toBeGreaterThan(0);
      expect(v.g).toBeLessThanOrEqual(0.5);
      expect(v.d ?? 0).toBeGreaterThan(0);
    }
    // A sting is low: the lowest voice sits well under the first octave above middle C.
    expect(voices.some((v) => v.n === 'e2')).toBe(true);
  });

  it('has every track the game asks for', () => {
    const wanted = ['title', 'map', 'boss', 'ending', ...CINE_TRACK, ...LEVELS.map((l) => l.track)];
    for (const t of wanted) expect(MUSIC[t], t).toBeDefined();
  });

  it('parses every music part and yields events in range', () => {
    for (const [name, track] of Object.entries(MUSIC)) {
      expect(track.bpm).toBeGreaterThan(40);
      for (const part of track.parts) {
        for (let cyc = 0; cyc < 8; cyc++) {
          const ev: MiniEvent[] = [];
          evalMini(parseMini(part.notes), 0, 1, cyc, ev);
          expect(ev.length, `${name}: ${part.notes.slice(0, 20)}`).toBeGreaterThan(0);
          for (const e of ev) {
            expect(e.t0).toBeGreaterThanOrEqual(0);
            expect(e.t1).toBeLessThanOrEqual(1.0000001);
          }
        }
      }
    }
  });

  it('gives every music part a role', () => {
    for (const [name, track] of Object.entries(MUSIC)) {
      for (const part of track.parts) {
        expect(part.role, `${name}: ${part.notes.slice(0, 24)}`).toBeDefined();
        expect(Object.keys(PART_PAN)).toContain(part.role);
      }
    }
  });

  it('places each Undertone event where partPanAt says, and leaves centred parts without a pan', () => {
    for (const [name, track] of Object.entries(MUSIC)) {
      for (const part of track.parts) {
        const v = buildVoice(Undertone, part, 1, true, true);
        const haps = v
          .query({ begin: new Fraction(0), end: new Fraction(8) })
          .filter((h) => hasOnset(h));
        expect(haps.length, name).toBeGreaterThan(0);
        for (const h of haps) {
          const pos = h.part.begin.toNumber() % 1;
          if (undertonePan(part.role) === undefined) {
            expect(h.value, `${name} ${part.role}`).not.toHaveProperty('pan');
          } else {
            expect(h.value.pan, `${name} ${part.role} at ${pos}`).toBe(partPanAt(part.role!, pos));
          }
        }
      }
    }
  });

  it('does not touch a part’s pan or gain when it is not placed', () => {
    for (const track of Object.values(MUSIC)) {
      for (const part of track.parts) {
        const v = buildVoice(Undertone, part, 1, true);
        for (const h of v.query({ begin: new Fraction(0), end: new Fraction(1) })) {
          expect(h.value).not.toHaveProperty('pan');
          expect(h.value.gainLevel).toBe(part.g);
        }
      }
    }
  });
});
