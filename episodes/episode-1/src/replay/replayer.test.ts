// Replays a trimmed real phone sample on the built WASM and checks every attempt against what was recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSession, type Session } from '@lieutenant-fizz/engine/session/log';
import { beforeAll, describe, expect, it } from 'vitest';
import { State } from '../sim/protocol';
import { Sim, type SpriteRect } from '../sim/sim';
import { entryAt } from './entry';
import { Replayer } from './replayer';
import { markersOf } from './timeline';

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
const built = existsSync(wasmPath);
const fixtureFile = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/fudge-bog/${name}`, import.meta.url)));
/** The fixture, read the way a zip's files are. */
const fixtureSession = (): Session =>
  parseSession('fudge-bog', [
    { name: 'session.ndjson', data: fixtureFile('session.ndjson') },
    { name: 'specs.json', data: fixtureFile('specs.json') },
  ]);

/** A copy of a session with its events changed by `edit`, which may change an event in place. */
function doctored(session: Session, edit: (events: Session['events']) => void): Session {
  const events = session.events.map((e) => ({ ...e }));
  edit(events);
  return { ...session, events };
}

// The attempts in the fixture ended in these deaths (the `death` event ticks of the real recording).
const DEATH_TICKS = [4371, 5134, 5970, 7254, 7571, 7901];

// The fingerprint of Fudge Bog (level 7) when the fixture was recorded. When the level is edited the recorded
// run no longer applies to it, so the fixture tests skip with a note; the scripted-run tests keep guarding the
// sim. Refresh the fixture from a new recording, then update this.
const FUDGE_BOG_HASH = 0x975ce0f7;
const CHANGED = 'Fudge Bog has been edited since the fixture was recorded; record a new one';

describe('entry state from a log', () => {
  const { events } = fixtureSession();
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
  let session: Session;

  const fakeRects = (names: string[]): Record<string, SpriteRect> =>
    Object.fromEntries(
      names.map((n, i) => [n, { u: i / 512, v: 0, uw: 1 / 512, vh: 1 / 512, w: 16, h: 16 }]),
    );

  beforeAll(async () => {
    sim = await Sim.load(readFileSync(wasmPath));
    sim.setSprites(fakeRects(sim.spriteNames()));
    session = fixtureSession();
  });

  it('dies where the player died, on the same tick, in every attempt', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const replayer = new Replayer(sim, session);
    expect(replayer.attempts).toHaveLength(6);
    replayer.attempts.forEach((_, i) => {
      replayer.load(i);
      replayer.run();
      expect(replayer.drift, `attempt ${i + 1} drifted`).toBeNull();
      expect(replayer.deathTick, `attempt ${i + 1}`).toBe(DEATH_TICKS[i]);
      expect(replayer.lateBy, `attempt ${i + 1}`).toBe(0);
    });
  });

  it('checks the lives, ammo and score too, and every one of them matches', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const states = session.events.filter((e) => e.e === 'st').length;
    expect(states).toBeGreaterThan(50);
    const replayer = new Replayer(sim, session);
    replayer.load(1);
    replayer.run();
    expect(replayer.drift).toBeNull();
  });

  it('reports the first place it stops matching when a recorded position is wrong', () => {
    const target = session.events.find((e) => e.e === 'pos' && e.t > 4100);
    expect(target).toBeDefined();
    const replayer = new Replayer(
      sim,
      doctored(session, (events) => {
        const e = events.find((x) => x.e === 'pos' && x.t === target!.t)!;
        e['x'] = (e['x'] as number) + 1;
      }),
    );
    replayer.load(0);
    replayer.run();
    expect(replayer.drift).toMatchObject({ kind: 'pos', tick: target!.t });
  });

  it('reports a recorded state that the replay does not reach', () => {
    const replayer = new Replayer(
      sim,
      doctored(session, (events) => {
        const e = events.find((x) => x.e === 'st' && x.t > 4100)!;
        e['ammo'] = (e['ammo'] as number) + 3;
      }),
    );
    replayer.load(0);
    replayer.run();
    expect(replayer.drift).toMatchObject({ kind: 'st' });
    expect(replayer.drift?.recorded).toContain('ammo');
  });

  it('reports a death the recording has and the replay does not, and one it does not have', () => {
    const noDeath = new Replayer(
      sim,
      doctored(session, (events) => {
        for (const e of events) if (e.e === 'death') e.e = 'gone';
      }),
    );
    noDeath.load(0);
    noDeath.run();
    expect(noDeath.drift).toMatchObject({ kind: 'death', recorded: 'no death' });

    // Cut the log off before Ben dies: the replay would die, but the recording ends first.
    const early = doctored(session, (events) => {
      const level2 = events.findIndex((e, i) => i > 0 && e.e === 'level' && e['attempt'] === 2);
      events.splice(level2 - 60, 60);
    });
    const replayer = new Replayer(sim, early);
    replayer.load(0);
    replayer.run();
    // The recording's attempt now ends before the death, so it must not claim one it never saw.
    expect(replayer.deathTick).toBeNull();
  });

  it('still replays an older sample whose level event was stamped a few ticks late', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const late = doctored(session, (events) => {
      const e = events.find((x) => x.e === 'level' && x['attempt'] === 2)!;
      e.t += 3;
    });
    const replayer = new Replayer(sim, late);
    replayer.load(1);
    replayer.run();
    // Nothing in Fudge Bog depends on the few ticks before Ben moves, so any start matches; levels with moving
    // platforms are where the search for the start matters.
    expect(replayer.drift).toBeNull();
    expect(replayer.deathTick).toBe(DEATH_TICKS[1]);
  });

  it('settles on a start and finishes loading when no start matches all the way', () => {
    const wrong = doctored(session, (events) => {
      const e = events.filter((x) => x.e === 'pos' && x.t > 4600)[0]!;
      e['y'] = (e['y'] as number) + 2;
    });
    const replayer = new Replayer(sim, wrong);
    const started = performance.now();
    replayer.load(1);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(replayer.lateBy).toBeGreaterThanOrEqual(0);
    expect(replayer.lateBy).toBeLessThanOrEqual(15);
    replayer.run();
    expect(replayer.drift).toMatchObject({ kind: 'pos' });
  });

  it('seeks to a tick the same way running straight to it does, forward and back', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const replayer = new Replayer(sim, session);
    replayer.load(2);
    const at = (tick: number): number[] => {
      replayer.seek(tick);
      return [
        replayer.tick,
        sim.get(State.PLAYER_X),
        sim.get(State.PLAYER_Y),
        sim.get(State.SCORE),
      ];
    };
    const target = replayer.attempt!.startTick + 400;
    const straight = at(target);
    const further = at(target + 200);
    expect(further[0]).toBe(target + 200);
    // Back to the same tick: restarts the attempt and runs up to it.
    expect(at(target)).toEqual(straight);
    // Past the ends is moved into the attempt.
    expect(at(0)[0]).toBe(replayer.attempt!.startTick);
    expect(at(99_999)[0]).toBe(replayer.attempt!.endTick);
  });

  it('seeks the longest attempt in well under a second', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const replayer = new Replayer(sim, session);
    const longest = replayer.attempts.reduce((a, b) =>
      b.endTick - b.startTick > a.endTick - a.startTick ? b : a,
    );
    replayer.load(replayer.attempts.indexOf(longest));
    const started = performance.now();
    replayer.seek(longest.endTick);
    replayer.seek(longest.startTick);
    replayer.seek(longest.endTick);
    // Two full runs and a restart; a seek from the start to the end is one of these.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('can be loaded again and gives the same run', (ctx) => {
    if (sim.levelHash(7) !== FUDGE_BOG_HASH) ctx.skip(CHANGED);
    const replayer = new Replayer(sim, session);
    replayer.load(2);
    replayer.run();
    const first = replayer.deathTick;
    replayer.load(2);
    replayer.run();
    expect(replayer.deathTick).toBe(first);
    expect(first).toBe(DEATH_TICKS[2]);
  });

  it('refuses an attempt it cannot start', () => {
    const replayer = new Replayer(sim, session);
    expect(() => replayer.load(99)).toThrow(/cannot be replayed/);
  });

  it('marks the death on the attempt’s timeline, with its cause and place', () => {
    const replayer = new Replayer(sim, session);
    const markers = markersOf(session.events, replayer.attempts[0]!);
    expect(markers.filter((m) => m.kind === 'death')).toEqual([
      expect.objectContaining({ tick: 4371, x: 15.2, y: 4, text: 'A pod’s puff (Pod)' }),
    ]);
  });

  it('knows how each attempt ended', () => {
    const replayer = new Replayer(sim, session);
    expect(replayer.attempts.map((a) => a.info?.outcome)).toEqual(Array(6).fill('died'));
  });
});
