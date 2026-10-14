// Tests for the Episode 1 play sample adapter: what each game happening becomes in the log.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { SessionRecorder } from '@lieutenant-fizz/engine/session/recorder';
import { memoryStore } from '@lieutenant-fizz/engine/session/store';
import { describe, expect, it } from 'vitest';
import { Ev, State } from '../sim/protocol';
import { PATH_EVERY, PlaySample, type SampleEvent, type SampleView } from './play-sample';

async function setup(initial: Record<number, number> = {}, waiting: SampleEvent[] = []) {
  const store = memoryStore();
  const clock = { tick: 0 };
  const rec = new SessionRecorder({
    store,
    now: () => 0,
    wall: () => new Date(2026, 9, 13),
    tick: () => clock.tick,
    newId: () => 's',
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  await rec.start({});
  const values: Record<number, number> = { ...initial };
  const level = { on: true };
  // The sim's event queue: tests push what a step raised, and clear it as the game's drain does.
  const queue: SampleEvent[] = [...waiting];
  const view: SampleView = {
    get: (i) => values[i] ?? 0,
    eventCount: () => queue.length,
    eventsSince: (from) => queue.slice(from),
    levelHash: (id) => 0x9000_0000 + id,
    inLevel: () => level.on,
    levelName: (id) => `Level ${id}`,
    captionName: (i) => `cap${i}`,
    toastName: (i) => `toast${i}`,
    pads: () => [],
  };
  const sample = new PlaySample(rec, view);
  const events = async () => {
    await rec.flush();
    return ((await store.read('s'))?.chunks ?? [])
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  };
  return { sample, values, level, events, queue, clock };
}

describe('PlaySample.tick', () => {
  it('records the input word only when it changes', async () => {
    const { sample, events } = await setup();
    for (const bits of [0, 0, 4, 4, 4, 5, 0]) sample.tick(bits);
    expect((await events()).filter((e) => e.e === 'in').map((e) => e.b)).toEqual([4, 5, 0]);
  });

  it('writes Ben’s path every few ticks while he is in a level, rounded', async () => {
    const { sample, values, events } = await setup({
      [State.PLAYER_X]: 12.3456,
      [State.PLAYER_Y]: 4.5,
    });
    for (let i = 0; i < PATH_EVERY * 3; i += 1) sample.tick(0);
    const path = (await events()).filter((e) => e.e === 'pos');
    expect(path).toHaveLength(3);
    expect(path[0]).toMatchObject({ x: 12.35, y: 4.5 });
    values[State.PLAYER_X] = 13;
    for (let i = 0; i < PATH_EVERY; i += 1) sample.tick(0);
    expect((await events()).filter((e) => e.e === 'pos').pop()).toMatchObject({ x: 13 });
  });

  it('writes no path outside a level', async () => {
    const { sample, level, events } = await setup();
    level.on = false;
    for (let i = 0; i < PATH_EVERY * 4; i += 1) sample.tick(0);
    expect((await events()).filter((e) => e.e === 'pos')).toEqual([]);
  });

  it('writes lives, ammo, score and pogo only when one changes', async () => {
    const { sample, values, events } = await setup({
      [State.LIVES]: 3,
      [State.AMMO]: 5,
      [State.SCORE]: 0,
    });
    for (let i = 0; i < PATH_EVERY * 3; i += 1) sample.tick(0);
    values[State.SCORE] = 100;
    for (let i = 0; i < PATH_EVERY; i += 1) sample.tick(0);
    const states = (await events()).filter((e) => e.e === 'st');
    expect(states.map((s) => s.score)).toEqual([0, 100]);
    expect(states[0]).toEqual(expect.objectContaining({ lives: 3, ammo: 5, pogo: 0 }));
  });

  it('records a death once, with its cause and where, and again after a new life', async () => {
    const { sample, values, level, events } = await setup({
      [State.PLAYER_X]: 30.256,
      [State.PLAYER_Y]: 2.4,
    });
    sample.tick(0);
    values[State.PLAYER_DEAD] = 1;
    values[State.DEATH_CAUSE] = 3;
    values[State.DEATH_DETAIL] = 5;
    sample.tick(0);
    sample.tick(0);
    values[State.PLAYER_DEAD] = 0;
    level.on = false;
    sample.tick(0);
    level.on = true;
    values[State.PLAYER_DEAD] = 1;
    sample.tick(0);
    const deaths = (await events()).filter((e) => e.e === 'death');
    expect(deaths).toHaveLength(2);
    expect(deaths[0]).toMatchObject({ cause: 3, detail: 5, x: 30.26, y: 2.4 });
  });
});

describe('PlaySample events', () => {
  it('records screens, sub-screens and menu moves, naming a row where it can', async () => {
    const { sample, events } = await setup();
    sample.screen('title');
    sample.sub('options');
    sample.sub(null);
    sample.menu(2, 'Options');
    sample.menu(3);
    expect(await events()).toEqual([
      expect.objectContaining({ e: 'screen', to: 'title' }),
      expect.objectContaining({ e: 'sub', to: 'options' }),
      expect.objectContaining({ e: 'sub', to: null }),
      expect.objectContaining({ e: 'menu', i: 2, label: 'Options' }),
      expect.objectContaining({ e: 'menu', i: 3 }),
    ]);
  });

  it('records the options only when they change', async () => {
    const { sample, events } = await setup();
    sample.settings({ music: 8 });
    sample.settings({ music: 8 });
    sample.settings({ music: 7 });
    expect((await events()).map((e) => e.o)).toEqual([{ music: 8 }, { music: 7 }]);
  });

  it('records simulation events by name, skipping the HUD, with a level start counting attempts', async () => {
    const { sample, events } = await setup();
    sample.simEvent({ kind: Ev.HUD, a: 0, b: 0, c: 0 });
    sample.simEvent({ kind: Ev.LEVEL_START, a: 4, b: 0, c: 0 });
    sample.simEvent({ kind: Ev.DIED, a: 2, b: 4, c: 0 });
    sample.simEvent({ kind: Ev.LEVEL_START, a: 4, b: 0, c: 0 });
    sample.simEvent({ kind: Ev.CAPTION, a: 9, b: 10.123, c: 20 });
    sample.simEvent({ kind: Ev.TOAST, a: 1, b: 0, c: 0 });
    sample.simEvent({ kind: 99, a: 0, b: 0, c: 0 });
    const got = (await events()).filter((e) => e.e !== 'enter');
    expect(got.map((e) => e.e)).toEqual(['level', 'ev', 'level', 'ev', 'ev', 'ev']);
    expect(got[0]).toMatchObject({ id: 4, name: 'Level 4', attempt: 1 });
    expect(got[2]).toMatchObject({ attempt: 2 });
    expect(got[1]).toMatchObject({ k: 'died', a: 2, b: 4 });
    expect(got[3]).toMatchObject({ k: 'caption', n: 'cap9', b: 10.12 });
    expect(got[4]).toMatchObject({ k: 'toast', n: 'toast1' });
    expect(got[5]).toMatchObject({ k: 'kind99' });
  });

  it('writes the state a level was entered with right after its start, and the input held on that step', async () => {
    const { sample, values, events } = await setup({
      [State.LIVES]: 2,
      [State.AMMO]: 14,
      [State.SCORE]: 513,
      [State.NEXT_LIFE]: 600,
      [State.DONE_MASK]: 5,
      [State.POGO_HEIGHT]: 6.6049,
    });
    sample.tick(18);
    values[State.LIVES] = 1;
    sample.simEvent({ kind: Ev.LEVEL_START, a: 7, b: 0, c: 0 });
    const got = await events();
    const at = got.findIndex((e) => e.e === 'level');
    expect(got[at + 1]).toMatchObject({
      e: 'enter',
      id: 7,
      lives: 1,
      ammo: 14,
      score: 513,
      next: 600,
      done: 5,
      pogoH: 6.6,
      held: 18,
      lvh: 0x9000_0007,
    });
  });
});

describe('PlaySample event ticks', () => {
  it('stamps each event with the tick of the step that raised it', async () => {
    const { sample, queue, clock, events } = await setup();
    queue.push({ kind: Ev.TOAST, a: 1, b: 0, c: 0 });
    clock.tick = 100;
    sample.tick(0);
    queue.push({ kind: Ev.TOAST, a: 2, b: 0, c: 0 });
    clock.tick = 101;
    sample.tick(0);
    const toasts = (await events()).filter((e) => e.e === 'ev');
    expect(toasts.map((e) => [e.t, e.a])).toEqual([
      [100, 1],
      [101, 2],
    ]);
  });

  it('writes an event left in the queue outside a step at that tick, and not again with the next step', async () => {
    const { sample, queue, clock, events } = await setup();
    clock.tick = 70;
    queue.push({ kind: Ev.TOAST, a: 1, b: 0, c: 0 });
    sample.outsideStep();
    // The next step runs (the clock moves on) with that event still queued, then raises one of its own.
    clock.tick = 71;
    queue.push({ kind: Ev.TOAST, a: 2, b: 0, c: 0 });
    sample.tick(0);
    expect((await events()).filter((e) => e.e === 'ev').map((e) => [e.t, e.a])).toEqual([
      [70, 1],
      [71, 2],
    ]);
  });

  it('writes an event raised outside any step once, then counts from the emptied queue', async () => {
    const { sample, queue, clock, events } = await setup();
    clock.tick = 50;
    queue.push({ kind: Ev.TOAST, a: 1, b: 0, c: 0 });
    sample.beforeDrain();
    queue.length = 0;
    clock.tick = 51;
    sample.tick(0);
    queue.push({ kind: Ev.TOAST, a: 2, b: 0, c: 0 });
    clock.tick = 52;
    sample.tick(0);
    expect((await events()).filter((e) => e.e === 'ev').map((e) => [e.t, e.a])).toEqual([
      [50, 1],
      [52, 2],
    ]);
  });

  it('leaves out events that were already waiting when the sample started', async () => {
    const { sample, queue, events } = await setup({}, [{ kind: Ev.TOAST, a: 9, b: 0, c: 0 }]);
    sample.tick(0);
    queue.push({ kind: Ev.TOAST, a: 3, b: 0, c: 0 });
    sample.tick(0);
    expect((await events()).filter((e) => e.e === 'ev').map((e) => e.a)).toEqual([3]);
  });
});

describe('PlaySample touch layout', () => {
  it('writes the layout when it changes, not when it is written again', async () => {
    const { sample, events } = await setup();
    const layout = {
      w: 844,
      h: 390,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      spec: { scale: 1 },
    };
    sample.touch(layout);
    sample.touch({ ...layout });
    sample.touch({ ...layout, spec: { scale: 1.2 } });
    const got = (await events()).filter((e) => e.e === 'touch');
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ w: 844, h: 390, spec: { scale: 1 } });
    expect(got[1]).toMatchObject({ spec: { scale: 1.2 } });
  });
});
