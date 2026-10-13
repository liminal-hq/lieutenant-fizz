// Records a run with the real play sample code on the built WASM, then replays what it wrote.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// This guards the recorder, the entry inference and the sim's determinism together, and keeps passing when
// levels change.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SessionRecorder } from '@lieutenant-fizz/engine/session/recorder';
import { memoryStore } from '@lieutenant-fizz/engine/session/store';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlaySample, type SampleView } from '../sample/play-sample';
import { Input, Level, Mode, State } from '../sim/protocol';
import { Sim, type SpriteRect } from '../sim/sim';
import { parseLog } from './log';
import { Replayer } from './replayer';

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
const built = existsSync(wasmPath);

const fakeRects = (names: string[]): Record<string, SpriteRect> =>
  Object.fromEntries(
    names.map((n, i) => [n, { u: i / 512, v: 0, uw: 1 / 512, vh: 1 / 512, w: 16, h: 16 }]),
  );

/** A fixed pattern of presses: run right, hop now and then, shoot once, back up a little. */
function script(i: number): number {
  let bits: number = Input.RIGHT;
  if (i % 90 >= 10 && i % 90 < 28) bits |= Input.JUMP;
  if (i % 200 === 150) bits |= Input.FIRE;
  if (i >= 300 && i < 330) bits = Input.LEFT;
  return bits;
}

/** Records `ticks` of the script in a level with the real adapter, and returns the log's events and the end position. */
async function record(sim: Sim, level: number, ticks: number) {
  const store = memoryStore();
  const rec = new SessionRecorder({
    store,
    now: () => 0,
    wall: () => new Date(2026, 0, 1),
    tick: () => sim.get(State.TICK),
    newId: () => 'r',
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  await rec.start({});
  const view: SampleView = {
    get: (i) => sim.get(i),
    inLevel: () => sim.x.mode() === Mode.LEVEL,
    levelName: (id) => `Level ${id}`,
    captionName: (i) => `cap${i}`,
    toastName: (i) => `toast${i}`,
    pads: () => [],
  };
  const sample = new PlaySample(rec, view);

  sim.x.game_new();
  sim.x.set_view(11.5, 6.5);
  sim.x.enter_level(level);
  for (const e of sim.drainEvents()) sample.simEvent(e);
  for (let i = 0; i < ticks; i++) {
    const bits = script(i);
    sim.step(bits);
    sample.tick(bits);
    for (const e of sim.drainEvents()) sample.simEvent(e);
  }
  await rec.flush();
  const text = ((await store.read('r'))?.chunks ?? []).join('');
  return { events: parseLog(text), x: sim.get(State.PLAYER_X), y: sim.get(State.PLAYER_Y) };
}

// These tests run against the real WASM (built by `bun run build:wasm`); CI builds it first.
describe.skipIf(!built)('a recorded run replays exactly', () => {
  let recorder: Sim;
  let player: Sim;

  beforeAll(async () => {
    const bytes = readFileSync(wasmPath);
    recorder = await Sim.load(bytes);
    recorder.setSprites(fakeRects(recorder.spriteNames()));
    // A second instance, so the replay starts from a clean world as it does for a watcher.
    player = await Sim.load(bytes);
    player.setSprites(fakeRects(player.spriteNames()));
  });

  for (const [name, level] of [
    ['the Crater', Level.CRATER],
    ['the Caves', Level.CAVES],
    ['the Citadel', Level.CITADEL],
  ] as const) {
    it(`matches every recorded position in ${name}`, async () => {
      const { events } = await record(recorder, level, 600);
      expect(events.filter((e) => e.e === 'pos').length).toBeGreaterThan(100);
      const replayer = new Replayer(player, events);
      expect(replayer.attempts).toHaveLength(1);
      replayer.load(0);
      replayer.run();
      expect(replayer.drift).toBeNull();
      // The run may end in a death, which the replay must reach on the recorded tick (no drift says it did).
      expect(replayer.checked).toBeGreaterThan(5);
    });
  }

  it('ends in the same place the recorded run ended', async () => {
    const { events, x, y } = await record(recorder, Level.CRATER, 450);
    const replayer = new Replayer(player, events);
    replayer.load(0);
    // Run to the last tick of the recording, not just to its last event.
    while (replayer.tick < replayer.attempts[0]!.startTick + 450) replayer.step();
    expect(player.get(State.PLAYER_X)).toBeCloseTo(x, 4);
    expect(player.get(State.PLAYER_Y)).toBeCloseTo(y, 4);
  });
});
