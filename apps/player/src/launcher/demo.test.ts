// Tests for what happens in the scenery.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  CELL,
  cuesBetween,
  demoState,
  loopSeconds,
  periodFor,
  reachTime,
  type Course,
  type DemoItem,
} from './demo';

const items: DemoItem[] = [
  { kind: 'treat', sprite: 0, x: 120, y: 6 },
  { kind: 'gloop', x: 240, fate: 'stomp' },
  { kind: 'gloop', x: 400, fate: 'shot' },
];
const course: Course = { items, speed: 25, period: 640, benX: 100 };
const total = loopSeconds(course);

const actor = (t: number, id: string, still = false) =>
  demoState(t, course, still).actors.find((a) => a.id === id);

describe('where things reach Ben', () => {
  it('is the distance to him over the ground speed, round the loop', () => {
    expect(reachTime(items[0] as DemoItem, course)).toBeCloseTo(20 / 25);
    expect(reachTime(items[1] as DemoItem, course)).toBeCloseTo(140 / 25);
    // Something behind Ben comes round once the loop has turned.
    const behind: DemoItem = { kind: 'treat', sprite: 0, x: 40, y: 0 };
    expect(reachTime(behind, course)).toBeCloseTo((640 - 60) / 25);
  });

  it('makes the loop wider than a wide window, so an item is out of sight when it wraps', () => {
    expect(periodFor(300, 640)).toBe(640);
    expect(periodFor(900, 640)).toBe(932);
  });
});

describe('a treat', () => {
  it('stands until Ben reaches it, pops, and is gone until it comes round again', () => {
    const reach = reachTime(items[0] as DemoItem, course);
    expect(actor(reach - 0.2, 'treat-0')?.opacity).toBe(1);
    expect(actor(reach + 0.2, 'treat-0')?.opacity).toBeLessThan(1);
    expect(actor(reach + 0.2, 'treat-0')?.scale).toBeGreaterThan(1);
    expect(actor(reach + 0.6, 'treat-0')).toBeUndefined();
    // Once it is off the left edge it has wrapped, and waits on the right for its next pass.
    expect(actor(reach + total - 0.2, 'treat-0')?.opacity).toBe(1);
  });

  it('stays still in place when the picture is at rest', () => {
    expect(actor(5, 'treat-0', true)?.x).toBe(120);
  });
});

describe('a stomped gloop', () => {
  const reach = reachTime(items[1] as DemoItem, course);

  it('is hopped on at the moment it reaches Ben, then squashed and dazed, and walks on', () => {
    expect(actor(reach - 0.5, 'gloop-1')?.cell).toBeLessThanOrEqual(CELL.gloop1);
    expect(actor(reach + 0.05, 'gloop-1')?.cell).toBe(CELL.squashed);
    expect(actor(reach + 0.05, 'stars-1')).toBeUndefined();
    expect(actor(reach + 0.5, 'stars-1')).toBeDefined();
    expect(actor(reach + 2, 'stars-1')).toBeUndefined();
    expect(actor(reach + 2, 'gloop-1')?.cell).toBeLessThanOrEqual(CELL.gloop1);
  });

  it('has Ben come down on its head, then bounce', () => {
    expect(demoState(reach - 0.001, course).ben.lift).toBeCloseTo(16, 0);
    expect(demoState(reach - 0.6, course).ben.pose).toBe('run');
    expect(demoState(reach - 0.3, course).ben.pose).toBe('air');
    expect(demoState(reach + 0.17, course).ben.lift).toBeGreaterThan(8);
    expect(demoState(reach + 0.6, course).ben.lift).toBe(0);
  });
});

describe('a shot gloop', () => {
  const reach = reachTime(items[2] as DemoItem, course);
  const hit = reach - 3;

  it('is hit by a bubble that flies from Ben, then stays dazed until it has passed him', () => {
    expect(actor(hit - 0.25, 'bubble-2')).toBeDefined();
    expect(actor(hit - 0.25, 'bubble-2')?.x).toBeGreaterThan(course.benX);
    expect(actor(hit - 0.6, 'bubble-2')).toBeUndefined();
    expect(actor(hit + 0.1, 'bubble-2')).toBeUndefined();
    expect(actor(hit - 0.1, 'stars-2')).toBeUndefined();
    expect(actor(hit + 0.1, 'stars-2')).toBeDefined();
    expect(actor(reach, 'stars-2')).toBeDefined();
  });

  it('has Ben take the shooting pose as he fires, and hop over the dazed gloop', () => {
    expect(demoState(hit - 0.4, course).ben.pose).toBe('shoot');
    expect(demoState(hit - 0.4 + 0.5, course).ben.pose).toBe('run');
    expect(demoState(reach, course).ben.lift).toBeGreaterThan(20);
  });
});

describe('cues', () => {
  it('reports each thing once, in order, as the clock passes it', () => {
    const all: string[] = [];
    let last = 0;
    for (let t = 0.05; t <= total; t += 0.05) {
      all.push(...cuesBetween(last, t, course));
      last = t;
    }
    expect(all.sort()).toEqual(['hit', 'pickup', 'shot', 'stomp']);
  });

  it('reports nothing for no time passing or a jump over a whole loop', () => {
    expect(cuesBetween(3, 3, course)).toEqual([]);
    expect(cuesBetween(0, total + 1, course)).toEqual([]);
  });

  it('sees an event across the end of the loop', () => {
    const reach = reachTime(items[0] as DemoItem, course);
    expect(cuesBetween(reach - 0.01, reach + 0.01, course)).toEqual(['pickup']);
    expect(cuesBetween(reach + 0.01, reach + 0.5, course)).toEqual([]);
    expect(cuesBetween(total + reach - 0.01, total + reach + 0.01, course)).toEqual(['pickup']);
  });
});

describe('the world loop', () => {
  it('shows the same picture a loop later', () => {
    expect(demoState(7.3, course)).toEqual(demoState(7.3 + total, course));
  });
});
