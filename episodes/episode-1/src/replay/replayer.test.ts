// Replays a trimmed real phone sample on the built WASM and checks every attempt against what was recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, type SpriteRect } from '../sim/sim';
import { entryAt } from './entry';
import { parseLog, type LogEvent } from './log';
import { Replayer } from './replayer';

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
const built = existsSync(wasmPath);
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/fudge-bog/${name}`, import.meta.url), 'utf8');

// The attempts in the fixture ended in these deaths (the `death` event ticks of the real recording).
const DEATH_TICKS = [4371, 5134, 5970, 7254, 7571, 7901];

describe('entry state from a log', () => {
  const events = parseLog(fixture('session.ndjson'));
  const levels = events.map((e, i) => (e.e === 'level' ? i : -1)).filter((i) => i >= 0);

  it('finds the six attempts at Fudge Bog', () => {
    expect(levels).toHaveLength(6);
    expect(events[levels[0]!]).toMatchObject({ name: 'Fudge Bog', attempt: 1 });
  });

  it('reads the held input and the lives, ammo and score before a level', () => {
    const entry = entryAt(events, levels[1]!);
    // The `st` written on the entering step of attempt 2: no spare lives left, 14 shots, a score of 513.
    expect(entry).toMatchObject({
      level: 7,
      tick: 4517,
      lives: 0,
      ammo: 14,
      score: 513,
      next: 600,
      done: 0,
      inferred: true,
    });
    expect(entry?.held).toBeGreaterThanOrEqual(0);
  });

  it('gives nothing for an event that is not a level', () => {
    expect(entryAt(events, 0)).toBeNull();
  });
});

// These tests run against the real WASM (built by `bun run build:wasm`); CI builds it first.
describe.skipIf(!built)('replaying the real Fudge Bog sample', () => {
  let sim: Sim;
  let events: LogEvent[];

  const fakeRects = (names: string[]): Record<string, SpriteRect> =>
    Object.fromEntries(
      names.map((n, i) => [n, { u: i / 512, v: 0, uw: 1 / 512, vh: 1 / 512, w: 16, h: 16 }]),
    );

  beforeAll(async () => {
    sim = await Sim.load(readFileSync(wasmPath));
    sim.setSprites(fakeRects(sim.spriteNames()));
    events = parseLog(fixture('session.ndjson'));
  });

  it('dies where the player died, on the same tick, in every attempt', () => {
    const replayer = new Replayer(sim, events);
    expect(replayer.attempts).toHaveLength(6);
    replayer.attempts.forEach((_, i) => {
      replayer.load(i);
      replayer.run();
      expect(replayer.drift, `attempt ${i + 1} drifted`).toBeNull();
      expect(replayer.deathTick, `attempt ${i + 1}`).toBe(DEATH_TICKS[i]);
    });
  });

  it('reports the first place it stops matching when a recorded position is wrong', () => {
    const doctored = events.map((e) => ({ ...e }));
    const target = doctored.find((e) => e.e === 'pos' && e.t > 4100);
    expect(target).toBeDefined();
    target!['x'] = (target!['x'] as number) + 1;
    const replayer = new Replayer(sim, doctored);
    replayer.load(0);
    replayer.run();
    expect(replayer.drift).toMatchObject({ kind: 'pos', tick: target!.t });
  });

  it('can be loaded again and gives the same run', () => {
    const replayer = new Replayer(sim, events);
    replayer.load(2);
    replayer.run();
    const first = replayer.deathTick;
    replayer.load(2);
    replayer.run();
    expect(replayer.deathTick).toBe(first);
    expect(first).toBe(DEATH_TICKS[2]);
  });

  it('refuses an attempt it cannot start', () => {
    const replayer = new Replayer(sim, events);
    expect(() => replayer.load(99)).toThrow(/cannot be replayed/);
  });
});
