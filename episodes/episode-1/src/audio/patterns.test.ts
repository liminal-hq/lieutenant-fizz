// Tests that Episode 1 captions map to effects and every music part parses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { evalMini, parseMini, type MiniEvent } from '@lieutenant-fizz/engine/audio';
import { describe, expect, it } from 'vitest';
import { CAPTION_SFX, MUSIC, SFX } from './patterns';
import { CINE_TRACK, LEVELS } from '../story';

describe('audio patterns', () => {
  it('maps every caption sound to an existing effect', () => {
    for (const [text, sfx] of Object.entries(CAPTION_SFX)) {
      expect(SFX[sfx], `${text} -> ${sfx}`).toBeDefined();
    }
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
});
