// Tests for Episode 1's haptic cue table: every caption is covered and every cue compiles to a sane pattern.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fakeBackend } from '@lieutenant-fizz/engine/haptic-backends';
import {
  calmPattern,
  compileRumble,
  compileVibrate,
  onTime,
  patternLength,
  totalTime,
} from '@lieutenant-fizz/engine/haptic-pattern';
import { GameHaptics } from '@lieutenant-fizz/engine/haptics';
import { CAPTION_SFX } from '../audio/patterns';
import { Sim } from '../sim/sim';
import { FIZZ_HAPTICS } from './fizz-haptics';

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
const built = existsSync(wasmPath);

describe('FIZZ_HAPTICS', () => {
  const cues = Object.entries(FIZZ_HAPTICS.cues);

  it('maps every caption to a cue that exists, or to null on purpose', () => {
    for (const [text, id] of Object.entries(FIZZ_HAPTICS.captions))
      if (id !== null) expect(FIZZ_HAPTICS.cues[id], text).toBeDefined();
  });

  it('covers every caption the audio knows about', () => {
    for (const text of Object.keys(CAPTION_SFX))
      expect(FIZZ_HAPTICS.captions, text).toHaveProperty([text]);
  });

  it.skipIf(!built)('covers every caption the sim can raise (the WASM table)', async () => {
    const sim = await Sim.load(readFileSync(wasmPath));
    const names = sim.names(1);
    expect(names.length).toBeGreaterThan(40);
    for (const text of names) expect(FIZZ_HAPTICS.captions, text).toHaveProperty([text]);
  });

  it('has no cue that nothing can raise', () => {
    // Menu and event cues are raised by name from the game; everything else comes from a caption.
    const byGame = new Set([
      'pogoOn',
      'pogoOff',
      'gameOver',
      'bossDown',
      ...cues.map(([id]) => id).filter((id) => id.startsWith('ui.')),
    ]);
    const mapped = new Set(Object.values(FIZZ_HAPTICS.captions));
    for (const [id] of cues) expect(mapped.has(id) || byGame.has(id), id).toBe(true);
  });

  it('keeps level-win and boss hit doubles silent or single', () => {
    // LEVEL_COMPLETE and DIED have no cue; "ta-da!" carries the win and "whoa!" the hurt.
    expect(FIZZ_HAPTICS.captions['ta-da!']).toBe('taDa');
    expect(FIZZ_HAPTICS.cues['levelComplete']).toBeUndefined();
    expect(FIZZ_HAPTICS.cues['died']).toBeUndefined();
  });

  it('compiles every cue to something sendable, inside the length and budget limits', () => {
    for (const [id, cue] of cues) {
      const out = compileVibrate(cue.pattern);
      expect(out.length, id).toBeGreaterThan(0);
      expect(totalTime(out), id).toBeLessThanOrEqual(1000);
      expect(onTime(out), id).toBeLessThanOrEqual(400);
      expect(patternLength(cue.pattern), id).toBeLessThanOrEqual(1000);
    }
  });

  it('compiles every cue to a controller rumble of at most eight segments inside a second', () => {
    for (const [id, cue] of cues) {
      const out = compileRumble(cue.pattern);
      expect(out.length, id).toBeGreaterThan(0);
      expect(out.length, id).toBeLessThanOrEqual(8);
      const end = out[out.length - 1];
      expect((end?.at ?? 0) + (end?.duration ?? 0), id).toBeLessThanOrEqual(1000);
    }
  });

  it('keeps menu cues in the ui lane and the rest in the game lane', () => {
    for (const [id, cue] of cues) expect(cue.lane, id).toBe(id.startsWith('ui.') ? 'ui' : 'game');
  });

  it('marks the cues that happen out in the level as world cues', () => {
    const world = cues.filter(([, c]) => c.world).map(([id]) => id);
    expect(world.sort()).toEqual(['clang', 'crumble', 'krunch', 'thoom', 'thunk']);
  });

  it('keeps calm cues short', () => {
    for (const [id, cue] of cues.filter(([, c]) => c.calm)) {
      const out = compileVibrate(calmPattern(cue.pattern));
      expect(totalTime(out), id).toBeLessThanOrEqual(300);
    }
  });

  it('plays a few real cues through GameHaptics', () => {
    const fake = fakeBackend();
    let t = 0;
    const h = new GameHaptics(FIZZ_HAPTICS, { now: () => t });
    h.setBackends({ device: fake });
    h.setGameplay(true);
    h.caption('jump');
    h.flush();
    t += 500;
    h.caption('whoa!');
    h.flush();
    t += 1000;
    h.caption('THOOM', false);
    h.flush();
    h.ui('move');
    h.flush();
    expect(fake.plays.map((p) => p.compiled)).toEqual([
      [15],
      [59, 6, 11, 9, 8, 12, 6],
      [expect.any(Number)],
    ]);
  });
});
