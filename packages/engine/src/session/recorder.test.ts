// Tests for the session recorder: what it writes, when, and what it does when the store or the size fails it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../storage';
import {
  ACTIVE_KEY,
  SessionRecorder,
  findUnfinished,
  isoWithOffset,
  type RecorderEnv,
  type RecorderState,
} from './recorder';
import { memoryStore, type SampleStore } from './store';

function setup(over: Partial<RecorderEnv> = {}) {
  let clock = 1000;
  let tick = 0;
  const store = over.store ?? memoryStore();
  const pointer = memoryStorage();
  const states: RecorderState[] = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  let next = 1;
  const env: RecorderEnv = {
    store,
    pointer,
    now: () => clock,
    wall: () => new Date(2026, 9, 13, 14, 2, 0),
    tick: () => tick,
    newId: () => 'abc123',
    setTimeout: (fn, ms) => {
      timers.set(next, { fn, at: clock + ms });
      return next++;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    onChange: (s) => states.push(s),
    ...over,
  };
  const rec = new SessionRecorder(env);
  return {
    rec,
    store,
    pointer,
    states,
    advance(ms: number) {
      clock += ms;
      tick += Math.round(ms / (1000 / 60));
      for (const [h, t] of [...timers]) {
        if (t.at <= clock) {
          timers.delete(h);
          t.fn();
        }
      }
    },
  };
}

const lines = async (store: SampleStore, id = 'abc123'): Promise<Record<string, unknown>[]> =>
  ((await store.read(id))?.chunks ?? [])
    .join('')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('SessionRecorder', () => {
  it('starts a session with its specs and start time, and points at it', async () => {
    const { rec, store, pointer } = setup();
    const id = await rec.start({ host: 'web', size: 'M' });
    expect(id).toBe('abc123');
    expect(rec.state).toBe('recording');
    const got = await store.read(id);
    expect(got?.header.specs).toEqual({ host: 'web', size: 'M' });
    expect(got?.header.startedAt).toMatch(/^2026-10-13T14:02:00[+-]\d\d:\d\d$/);
    expect(JSON.parse(pointer.getItem(ACTIVE_KEY)!).id).toBe('abc123');
  });

  it('stamps each event with the tick and the milliseconds since the start', async () => {
    const { rec, store, advance } = setup();
    await rec.start({});
    advance(500);
    rec.record('key', { k: 'ArrowRight', down: true });
    advance(250);
    rec.record('ptr', { x: 10, y: 20 });
    await rec.stop();
    expect(await lines(store)).toEqual([
      { t: 30, ms: 500, e: 'key', k: 'ArrowRight', down: true },
      { t: 45, ms: 750, e: 'ptr', x: 10, y: 20 },
    ]);
  });

  it('writes what is waiting every two seconds, not before', async () => {
    const { rec, store, advance } = setup();
    await rec.start({});
    rec.record('a');
    advance(1000);
    await Promise.resolve();
    expect((await store.read('abc123'))?.chunks).toEqual([]);
    advance(1000);
    await rec.flush();
    expect((await store.read('abc123'))?.chunks.length).toBe(1);
    rec.record('b');
    advance(2000);
    await rec.flush();
    expect((await store.read('abc123'))?.chunks.length).toBe(2);
  });

  it('ends the session on stop, writes the tail and clears the pointer', async () => {
    const { rec, store, pointer } = setup();
    await rec.start({});
    rec.record('last');
    const info = await rec.stop();
    expect(info?.ended).toBe(true);
    expect(await lines(store)).toHaveLength(1);
    expect(pointer.getItem(ACTIVE_KEY)).toBeNull();
    expect(rec.state).toBe('stopped');
    rec.record('after');
    await rec.flush();
    expect(await lines(store)).toHaveLength(1);
  });

  it('records nothing before it starts or after it stops, and stop twice is harmless', async () => {
    const { rec, store } = setup();
    rec.record('early');
    expect(await rec.stop()).toBeNull();
    await rec.start({});
    await rec.stop();
    expect(await rec.stop()).toBeNull();
    expect(await lines(store)).toEqual([]);
  });

  it('leaves a session open, with its pointer, when the page is closed mid-play', async () => {
    const { rec, store, pointer } = setup();
    await rec.start({});
    rec.record('seen');
    await rec.flush();
    rec.record('lost');
    // The page goes away here: no stop, no further flush.
    expect(pointer.getItem(ACTIVE_KEY)).not.toBeNull();
    const open = await findUnfinished(store);
    expect(open.map((s) => s.id)).toEqual(['abc123']);
    expect((await lines(store)).map((l) => l.e)).toEqual(['seen']);
  });

  it('warns once at the warning size and stops, ending the session, at the limit', async () => {
    const { rec, store, states } = setup({ warnBytes: 200, stopBytes: 600 });
    const warned: boolean[] = [];
    await rec.start({});
    for (let i = 0; i < 100 && rec.state === 'recording'; i += 1) {
      rec.record('x', { pad: 'y'.repeat(20) });
      if (rec.bytes >= 200 && !warned.length) warned.push(true);
    }
    expect(rec.state).toBe('full');
    expect(states).toContain('full');
    await rec.stop();
    const info = (await store.list())[0]!;
    expect(info.ended).toBe(true);
    expect(info.bytes).toBeGreaterThanOrEqual(600);
    expect(info.bytes).toBeLessThan(700);
  });

  it('stops as failed when the store fails, keeps what was written, and never throws', async () => {
    const inner = memoryStore();
    let broken = false;
    const store: SampleStore = {
      ...inner,
      append: async (id, chunk) => {
        if (broken) throw new Error('disk full');
        await inner.append(id, chunk);
      },
    };
    const { rec, states } = setup({ store });
    await rec.start({});
    rec.record('kept');
    await rec.flush();
    broken = true;
    rec.record('lost');
    await rec.flush();
    expect(rec.state).toBe('failed');
    expect(states).toContain('failed');
    expect(() => rec.record('more')).not.toThrow();
    expect((await inner.read('abc123'))?.chunks).toHaveLength(1);
  });

  it('does not start a second session while one is recording', async () => {
    const { rec } = setup();
    await rec.start({});
    const create = vi.spyOn(memoryStore(), 'create');
    expect(await rec.start({})).toBe('abc123');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('findUnfinished', () => {
  it('lists only sessions that were never ended', async () => {
    const store = memoryStore();
    await store.create({ v: 1, id: 'a', startedAt: '2026-10-13T10:00:00-04:00', specs: {} });
    await store.create({ v: 1, id: 'b', startedAt: '2026-10-13T11:00:00-04:00', specs: {} });
    await store.end('a');
    expect((await findUnfinished(store)).map((s) => s.id)).toEqual(['b']);
  });
});

describe('isoWithOffset', () => {
  it('writes a local time with its offset from UTC', () => {
    const text = isoWithOffset(new Date(2026, 0, 5, 3, 4, 5));
    expect(text).toMatch(/^2026-01-05T03:04:05[+-]\d\d:\d\d$/);
  });
});
