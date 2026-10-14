// Tests for reading touches and the touch layout from a play sample, on the real phone recording and small logs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { parseSession, type Session } from '@lieutenant-fizz/engine/session/log';
import { DEFAULT_TOUCH_SPEC } from '@lieutenant-fizz/engine/touch-layout';
import { describe, expect, it } from 'vitest';
import { findAttempts } from './replayer';
import { sessionOf } from './session-test-util';
import { fingersAt, layoutAt, touchesOf, type Touch } from './touches';

const file = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/fudge-bog/${name}`, import.meta.url)));
const fixture = (): Session =>
  parseSession('fudge-bog', [
    { name: 'session.ndjson', data: file('session.ndjson') },
    { name: 'specs.json', data: file('specs.json') },
  ]);

describe('touchesOf on the real recording', () => {
  const session = fixture();
  const attempts = findAttempts(session);

  it('finds the touches of an attempt, each landed on a control or missed', () => {
    const touches = touchesOf(session.events, attempts[0]!);
    expect(touches.length).toBeGreaterThan(10);
    for (const t of touches) {
      expect(t.miss).toBe(t.control === null);
      expect(t.path.length).toBeGreaterThan(0);
      expect(t.path[0]!.t).toBe(t.down);
    }
    const controls = new Set(touches.map((t) => t.control).filter(Boolean));
    expect([...controls].every((c) => ['dpad', 'jump', 'pogo', 'fire', 'pause'].includes(c!))).toBe(
      true,
    );
    expect(controls.has('dpad')).toBe(true);
    expect(controls.has('jump')).toBe(true);
  });

  it('keeps each touch inside its attempt', () => {
    const [a] = attempts;
    for (const t of touchesOf(session.events, a!)) {
      expect(t.down).toBeGreaterThanOrEqual(a!.startTick);
      expect(t.down).toBeLessThanOrEqual(a!.endTick);
    }
  });
});

describe('touchesOf on small logs', () => {
  const attempt = (events: object[]) => {
    const s = sessionOf('s', [{ t: 0, e: 'level', id: 1, name: 'L', attempt: 1 }, ...events]);
    return { s, a: findAttempts(s)[0]! };
  };

  it('calls a touch with no control under it a miss, and one on a control a hit', () => {
    const { s, a } = attempt([
      { t: 1, e: 'ptr', k: 'down', id: 1, ty: 'touch', x: 50, y: 60, on: 'ctl:jump' },
      { t: 5, e: 'ptr', k: 'up', id: 1, ty: 'touch', x: 50, y: 60, on: 'ctl:jump' },
      { t: 8, e: 'ptr', k: 'down', id: 2, ty: 'touch', x: 300, y: 100 },
      { t: 9, e: 'ptr', k: 'down', id: 3, ty: 'touch', x: 310, y: 100, on: 'ui:gl' },
    ]);
    const got = touchesOf(s.events, a);
    expect(got.map((t) => [t.control, t.miss, t.down, t.up])).toEqual([
      ['jump', false, 1, 5],
      [null, true, 8, null],
      [null, true, 9, null],
    ]);
  });

  it('follows a drag by its moves and ends it on cancel', () => {
    const { s, a } = attempt([
      { t: 1, e: 'ptr', k: 'down', id: 7, ty: 'touch', x: 10, y: 10, on: 'ctl:dpad' },
      { t: 2, e: 'ptr', k: 'move', id: 7, ty: 'touch', x: 20, y: 12 },
      { t: 3, e: 'ptr', k: 'cancel', id: 7, ty: 'touch', x: 25, y: 12 },
      { t: 4, e: 'ptr', k: 'move', id: 7, ty: 'touch', x: 99, y: 99 },
    ]);
    const [t] = touchesOf(s.events, a);
    expect(t!.path.map((p) => [p.x, p.y])).toEqual([
      [10, 10],
      [20, 12],
      [25, 12],
    ]);
    expect(t!.up).toBe(3);
  });

  it('leaves out touches on a menu, a card or the pause screen', () => {
    const { s, a } = attempt([
      { t: 1, e: 'screen', to: 'pause' },
      { t: 1, e: 'ptr', k: 'down', id: 1, ty: 'touch', x: 5, y: 5, on: 'menu:Resume' },
      { t: 2, e: 'screen', to: 'play' },
      { t: 3, e: 'ptr', k: 'down', id: 2, ty: 'touch', x: 6, y: 6, on: 'ctl:fire' },
    ]);
    expect(touchesOf(s.events, a).map((t) => t.control)).toEqual(['fire']);
  });
});

describe('fingersAt', () => {
  const touch = (over: Partial<Touch>): Touch => ({
    id: 1,
    miss: false,
    control: 'jump',
    down: 10,
    up: 20,
    path: [
      { x: 1, y: 1, t: 10 },
      { x: 2, y: 2, t: 15 },
      { x: 3, y: 3, t: 20 },
    ],
    ...over,
  });

  it('shows a finger from its down to its lift, moving with its path, and a trail behind it', () => {
    const f = fingersAt([touch({})], 16);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ x: 2, y: 2, down: true, fade: 1, miss: false });
    expect(f[0]!.trail.map((p) => p.x)).toEqual([1, 2]);
  });

  it('shows none before the touch, fades a lifted finger, and drops it after the linger', () => {
    expect(fingersAt([touch({})], 9)).toEqual([]);
    const fading = fingersAt([touch({})], 35)[0]!;
    expect(fading.down).toBe(false);
    expect(fading.fade).toBeCloseTo(0.5, 5);
    expect(fingersAt([touch({})], 51)).toEqual([]);
  });

  it('keeps a finger the log ended with down, and passes a miss on', () => {
    const f = fingersAt([touch({ up: null, miss: true, control: null })], 500, 20, 30);
    expect(f[0]).toMatchObject({ down: true, miss: true, x: 3, y: 3 });
  });
});

describe('layoutAt', () => {
  it('works the layout out from the window and the specs when the log did not write it down', () => {
    const got = layoutAt(fixture(), 5000);
    expect(got).toMatchObject({ w: 1173, h: 527, exact: false });
    expect(got!.placed.hit.jump).toBeDefined();
    expect(got!.placed.face.dpad.r).toBeGreaterThan(0);
  });

  it('uses the layout the log wrote down, the latest one at or before the tick', () => {
    const touch = (t: number, scale: number) => ({
      t,
      e: 'touch',
      w: 844,
      h: 390,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      spec: { ...DEFAULT_TOUCH_SPEC, scale },
    });
    const s = sessionOf('s', [touch(0, 1), touch(100, 1.2)]);
    const early = layoutAt(s, 50)!;
    const late = layoutAt(s, 150)!;
    expect(early.exact).toBe(true);
    expect(late.placed.face.jump.r).toBeGreaterThan(early.placed.face.jump.r);
  });

  it('gives nothing when there is no window to work from', () => {
    expect(layoutAt(sessionOf('s', [{ t: 0, e: 'pos', x: 1, y: 1 }]), 10)).toBeNull();
  });
});
