// Integration tests that run the Episode 1 sim against the built WASM.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Ev, Input, Level, Mode, Out, RenderFlag, State, STRIDE } from './protocol';
import { Sim, type SpriteRect } from './sim';

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));
const built = existsSync(wasmPath);

// These tests run against the real WASM (built by `bun run build:wasm`); CI builds it first.
describe.skipIf(!built)('Episode 1 WASM sim', () => {
  let sim: Sim;

  const fakeRects = (names: string[]): Record<string, SpriteRect> =>
    Object.fromEntries(
      names.map((n, i) => [n, { u: i / 512, v: 0, uw: 1 / 512, vh: 1 / 512, w: 16, h: 16 }]),
    );

  beforeAll(async () => {
    sim = await Sim.load(readFileSync(wasmPath));
    sim.setSprites(fakeRects(sim.spriteNames()));
  });

  const run = (ticks: number, held = 0): void => {
    for (let i = 0; i < ticks; i++) sim.step(held);
  };

  it('exposes name tables owned by Rust', () => {
    expect(sim.spriteNames()).toContain('ben_stand');
    expect(sim.names(1)).toContain('CLANG — dome open!');
    expect(sim.names(2).length).toBeGreaterThan(3);
    expect(sim.captionColour(1)).toBeGreaterThan(0);
  });

  it('rejects an atlas missing a required sprite', () => {
    const rects = fakeRects(sim.spriteNames());
    delete rects['ben_stand'];
    expect(() => sim.setSprites(rects)).toThrow(/ben_stand/);
  });

  it('runs a level: Ben lands, runs and the instance buffer fills', () => {
    sim.x.game_new();
    sim.x.enter_level(Level.CRATER);
    const events = sim.drainEvents();
    expect(events.some((e) => e.kind === Ev.LEVEL_START)).toBe(true);
    expect(sim.x.mode()).toBe(Mode.LEVEL);
    sim.x.set_view(11.5, 6.5);
    run(60);
    const y = sim.get(State.PLAYER_Y);
    expect(y).toBeCloseTo(4, 2);
    const x0 = sim.get(State.PLAYER_X);
    run(60, Input.RIGHT);
    expect(sim.get(State.PLAYER_X)).toBeGreaterThan(x0 + 4);

    const n = sim.render(0.5, RenderFlag.CULLING);
    expect(n).toBe(sim.out[Out.COUNT]);
    expect(n).toBeGreaterThan(100);
    const inst = sim.instances(n);
    expect(inst.length).toBe(n * STRIDE);
    expect(inst.every(Number.isFinite)).toBe(true);
    // Instance matrices: the bottom-right element of each is 1.
    expect(inst[15]).toBe(1);
    expect(sim.out[Out.LIGHTS]).toBeGreaterThan(0);
    expect(sim.lightPos[3]).toBeGreaterThan(0);
    expect(sim.camera.x).toBeGreaterThan(10);
  });

  it('round-trips game state and lets progress be restored', () => {
    sim.set(State.LIVES, 7);
    sim.set(State.SCORE, 123);
    sim.set(State.DONE_MASK, 5);
    sim.set(State.MAP_X, 12.5);
    sim.set(State.MAP_Y, 30);
    expect(sim.get(State.LIVES)).toBe(7);
    expect(sim.get(State.SCORE)).toBe(123);
    expect(sim.get(State.DONE_MASK)).toBe(5);
    expect(sim.get(State.HAS_MAP_POS)).toBe(1);
    expect(sim.get(State.MAP_X)).toBe(12.5);
  });

  it('emits captions and HUD events when Ben jumps and fires', () => {
    sim.x.game_new();
    sim.x.enter_level(Level.CRATER);
    sim.drainEvents();
    run(40);
    sim.step(Input.JUMP);
    sim.step(Input.FIRE);
    const kinds = new Set(sim.drainEvents().map((e) => e.kind));
    expect(kinds.has(Ev.CAPTION)).toBe(true);
    expect(kinds.has(Ev.HUD)).toBe(true);
    expect(sim.get(State.AMMO)).toBe(4);
  });

  it('runs the overworld and enters a level from it', () => {
    sim.x.game_new();
    sim.x.enter_map();
    expect(sim.x.mode()).toBe(Mode.MAP);
    sim.x.set_view(10, 6);
    run(30, Input.RIGHT | Input.DOWN);
    expect(sim.render(1, RenderFlag.CULLING)).toBeGreaterThan(100);
    expect(sim.out[Out.LIGHTING]).toBe(0);
  });
});
