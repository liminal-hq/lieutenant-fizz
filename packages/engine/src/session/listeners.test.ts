// Tests for the page listeners: what they record, what they drop, and that stopping really stops them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { listenToPage, pollPads, isTextTarget, type ListenEnv, type PadMemory } from './listeners';
import { SessionRecorder } from './recorder';
import { memoryStore } from './store';

class FakeTarget {
  handlers = new Map<string, Set<(e: never) => void>>();
  innerWidth = 844;
  innerHeight = 390;
  visibilityState = 'visible';
  addEventListener(type: string, fn: (e: never) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: never) => void) {
    this.handlers.get(type)?.delete(fn);
  }
  fire(type: string, e: object = {}) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(e as never);
  }
  count(): number {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}

async function setup(locate?: ListenEnv['locate']) {
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const store = memoryStore();
  let clock = 0;
  const rec = new SessionRecorder({
    store,
    now: () => clock,
    wall: () => new Date(2026, 9, 13),
    tick: () => 7,
    newId: () => 's',
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  await rec.start({});
  const stop = listenToPage(rec, { win, doc, locate });
  const events = async () => {
    await rec.flush();
    return ((await store.read('s'))?.chunks ?? [])
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  };
  return { win, doc, rec, stop, events, tick: (ms: number) => (clock += ms) };
}

const ptr = (over: object = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  clientX: 100.04,
  clientY: 200.06,
  timeStamp: 0,
  target: null,
  ...over,
});

describe('pointer events', () => {
  it('records down and up with the position to a tenth, and what was under it', async () => {
    const { win, events } = await setup((x, _y) => (x < 150 ? 'ctl:jump' : null));
    win.fire('pointerdown', ptr());
    win.fire('pointerup', ptr({ timeStamp: 100, clientX: 300 }));
    const got = await events();
    expect(got.map(({ e, k, x, y, on, ty }) => ({ e, k, x, y, on, ty }))).toEqual([
      { e: 'ptr', k: 'down', x: 100, y: 200.1, on: 'ctl:jump', ty: 'touch' },
      { e: 'ptr', k: 'up', x: 300, y: 200.1, on: undefined, ty: 'touch' },
    ]);
  });

  it('records moves of a held pointer, thinned by time and distance', async () => {
    const { win, events } = await setup();
    win.fire('pointerdown', ptr());
    win.fire('pointermove', ptr({ timeStamp: 5, clientX: 140 }));
    win.fire('pointermove', ptr({ timeStamp: 40, clientX: 101 }));
    win.fire('pointermove', ptr({ timeStamp: 80, clientX: 150 }));
    win.fire('pointerup', ptr({ timeStamp: 120, clientX: 150 }));
    const moves = (await events()).filter((e) => e.k === 'move');
    expect(moves.map((m) => m.x)).toEqual([150]);
  });

  it('ignores a pointer that moves without being pressed, such as a hovering mouse', async () => {
    const { win, events } = await setup();
    win.fire('pointermove', ptr({ pointerType: 'mouse', timeStamp: 100 }));
    expect(await events()).toEqual([]);
  });

  it('records a cancel, and records two fingers apart', async () => {
    const { win, events } = await setup();
    win.fire('pointerdown', ptr({ pointerId: 1 }));
    win.fire('pointerdown', ptr({ pointerId: 2, clientX: 600 }));
    win.fire('pointercancel', ptr({ pointerId: 1, timeStamp: 50 }));
    const got = await events();
    expect(got.map((e) => [e.k, e.id])).toEqual([
      ['down', 1],
      ['down', 2],
      ['cancel', 1],
    ]);
  });
});

describe('key events', () => {
  it('records the physical key code going down and up, not the character, and skips a held key repeating', async () => {
    const { win, events } = await setup();
    win.fire('keydown', { code: 'ArrowRight', repeat: false, target: null });
    win.fire('keydown', { code: 'ArrowRight', repeat: true, target: null });
    win.fire('keyup', { code: 'ArrowRight', repeat: false, target: null });
    const got = await events();
    expect(got.map((e) => [e.k, e.down])).toEqual([
      ['ArrowRight', true],
      ['ArrowRight', false],
    ]);
  });

  it('records no key in a text field or while composing text', async () => {
    const { win, events } = await setup();
    win.fire('keydown', { code: 'KeyA', repeat: false, target: { tagName: 'input' } });
    win.fire('keydown', { code: 'KeyB', repeat: false, target: { isContentEditable: true } });
    win.fire('keydown', { code: 'KeyC', repeat: false, isComposing: true, target: null });
    expect(await events()).toEqual([]);
    expect(isTextTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});

describe('page events', () => {
  it('records the page being hidden and shown, writing out what it has when hidden', async () => {
    const { doc, win, rec, events } = await setup();
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    await rec.flush();
    expect(await events()).toEqual([expect.objectContaining({ e: 'vis', v: 'hidden' })]);
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    win.fire('pagehide');
    expect((await events()).map((e) => e.v)).toEqual(['hidden', 'visible', 'gone']);
  });

  it('records the window size when it changes', async () => {
    const { win, events } = await setup();
    win.innerWidth = 740;
    win.innerHeight = 360;
    win.fire('resize');
    expect(await events()).toEqual([expect.objectContaining({ e: 'rs', w: 740, h: 360 })]);
  });

  it('stops listening, leaving nothing attached', async () => {
    const { win, doc, stop, events } = await setup();
    expect(win.count() + doc.count()).toBeGreaterThan(0);
    stop();
    expect(win.count() + doc.count()).toBe(0);
    win.fire('pointerdown', ptr());
    expect(await events()).toEqual([]);
  });
});

describe('pollPads', () => {
  const pad = (buttons: boolean[], axes: number[], index = 0) => ({
    index,
    buttons: buttons.map((pressed) => ({ pressed })),
    axes,
  });

  it('says nothing the first time it sees a pad, then records each change', async () => {
    const { rec, events } = await setup();
    const memory: PadMemory = new Map();
    pollPads(rec, [pad([false, false], [0, 0])], memory);
    pollPads(rec, [pad([true, false], [0.04, 0])], memory);
    pollPads(rec, [pad([true, false], [0.34, -0.5])], memory);
    pollPads(rec, [pad([false, false], [0.34, -0.5])], memory);
    const got = await events();
    expect(got.map(({ e, i, b, a, v, down }) => ({ e, i, b, a, v, down }))).toEqual([
      { e: 'pad', i: 0, b: 0, a: undefined, v: undefined, down: true },
      { e: 'ax', i: 0, b: undefined, a: 0, v: 0.3, down: undefined },
      { e: 'ax', i: 0, b: undefined, a: 1, v: -0.5, down: undefined },
      { e: 'pad', i: 0, b: 0, a: undefined, v: undefined, down: false },
    ]);
  });

  it('reads a pad that comes back afresh, and ignores empty slots', async () => {
    const { rec, events } = await setup();
    const memory: PadMemory = new Map();
    pollPads(rec, [pad([true], [])], memory);
    pollPads(rec, [null], memory);
    expect(memory.size).toBe(0);
    pollPads(rec, [pad([true], [])], memory);
    expect(await events()).toEqual([]);
  });
});
