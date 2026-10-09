// Tests for the haptic backends with a stand-in `navigator`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  fakeBackend,
  gamepadBackend,
  noneBackend,
  vibrateBackend,
  type RumbleActuator,
  type RumblePad,
  type RumbleTimers,
  type VibrateNavigator,
} from './haptic-backends';
import type { HapticPattern } from './haptic-pattern';

const bonk: HapticPattern = {
  events: [{ kind: 'transient', at: 0, intensity: 0.7, sharpness: 0.2 }],
};

function nav(
  opts: { active?: boolean | null; result?: boolean; throws?: boolean } = {},
): VibrateNavigator & { calls: unknown[] } {
  const calls: unknown[] = [];
  const n: VibrateNavigator & { calls: unknown[] } = {
    calls,
    vibrate(p: unknown) {
      calls.push(p);
      if (opts.throws) throw new Error('nope');
      return opts.result ?? true;
    },
  };
  if (opts.active !== null) n.userActivation = { hasBeenActive: opts.active ?? true };
  return n;
}

describe('vibrateBackend', () => {
  it('sends the compiled array to navigator.vibrate', () => {
    const n = nav();
    const r = vibrateBackend(n).play(bonk, 1);
    expect(n.calls).toEqual([[21]]);
    expect(r).toMatchObject({ ok: true, tier: 1, downgraded: true, compiled: [21], ms: 21 });
  });

  it('sends nothing before the page has been tapped, then works once it has', () => {
    const n = nav({ active: false });
    const b = vibrateBackend(n);
    expect(b.play(bonk, 1)).toMatchObject({ ok: false, reason: 'waiting for a tap' });
    expect(n.calls).toEqual([]);
    expect(b.caps().available).toBe(true);
    n.userActivation = { hasBeenActive: true };
    expect(b.play(bonk, 1).ok).toBe(true);
  });

  it('still works where the browser has no userActivation', () => {
    const n = nav({ active: null });
    expect(vibrateBackend(n).play(bonk, 1).ok).toBe(true);
  });

  it('is unavailable, not an error, without vibrate', () => {
    const b = vibrateBackend({});
    expect(b.caps()).toMatchObject({ available: false, reason: 'no vibrator', tier: 0 });
    expect(b.play(bonk, 1).ok).toBe(false);
    expect(() => {
      b.stop();
      b.dispose();
    }).not.toThrow();
  });

  it('treats a false return as unavailable from then on', () => {
    const n = nav({ result: false });
    const b = vibrateBackend(n);
    expect(b.play(bonk, 1).ok).toBe(false);
    expect(b.caps().available).toBe(false);
    b.play(bonk, 1);
    expect(n.calls).toHaveLength(1);
  });

  it('survives vibrate throwing', () => {
    const b = vibrateBackend(nav({ throws: true }));
    expect(b.play(bonk, 1)).toMatchObject({ ok: false, reason: 'vibrate threw' });
    expect(() => b.stop()).not.toThrow();
  });

  it('does not call vibrate for a pattern that compiles to silence', () => {
    const n = nav();
    const r = vibrateBackend(n).play(bonk, 0.1);
    expect(n.calls).toEqual([]);
    expect(r).toMatchObject({ ok: true, compiled: [], ms: 0 });
  });

  it('stop() calls vibrate(0) once after something was sent', () => {
    const n = nav();
    const b = vibrateBackend(n);
    b.stop();
    expect(n.calls).toEqual([]);
    b.play(bonk, 1);
    b.stop();
    b.stop();
    expect(n.calls).toEqual([[21], 0]);
  });
});

describe('noneBackend and fakeBackend', () => {
  it('none is unavailable and quiet', () => {
    expect(noneBackend.caps().available).toBe(false);
    expect(noneBackend.play(bonk, 1).ok).toBe(false);
  });

  it('the fake records plays and stops', () => {
    const f = fakeBackend();
    f.play(bonk, 1);
    f.stop();
    expect(f.plays).toHaveLength(1);
    expect(f.plays[0]?.compiled).toEqual([21]);
    expect(f.stops).toBe(1);
    expect(fakeBackend({ available: false }).play(bonk, 1).ok).toBe(false);
  });
});

/** A clock whose timers fire only when time is advanced. */
function fakeTimers(): RumbleTimers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let next = 1;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      const id = next++;
      jobs.set(id, { at: now + ms, fn });
      return id;
    },
    clear(h) {
      jobs.delete(h as number);
    },
    pending: () => jobs.size,
    advance(ms) {
      const to = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, j]) => j.at <= to)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        jobs.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = to;
    },
  };
}

interface Effect {
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
  startDelay: number;
}

function actuator(over: Partial<RumbleActuator> = {}): RumbleActuator & {
  effects: Effect[];
  resets: number;
} {
  const a = {
    effects: [] as Effect[],
    resets: 0,
    playEffect: (_type: 'dual-rumble', p: Effect) => {
      a.effects.push(p);
      return Promise.resolve('complete');
    },
    reset: () => {
      a.resets++;
      return Promise.resolve('complete');
    },
    ...over,
  };
  return a;
}

describe('gamepadBackend', () => {
  const pad = (a: RumbleActuator | null): RumblePad => ({ id: 'Test Pad', vibrationActuator: a });

  it('plays a one-segment pattern at once as a dual-rumble effect', () => {
    const a = actuator();
    const timers = fakeTimers();
    const r = gamepadBackend(() => pad(a), { timers }).play(bonk, 1);
    expect(a.effects).toEqual([
      { startDelay: 0, duration: 68, strongMagnitude: 0.56, weakMagnitude: 0.14 },
    ]);
    expect(r).toMatchObject({ ok: true, tier: 2, target: 'controller', ms: 68 });
    expect(timers.pending()).toBe(0);
  });

  it('chains later segments with timers', () => {
    const a = actuator();
    const timers = fakeTimers();
    const two: HapticPattern = {
      events: [
        { kind: 'transient', at: 0, intensity: 0.7, sharpness: 0.2 },
        { kind: 'transient', at: 100, intensity: 0.5, sharpness: 0.2 },
      ],
    };
    const r = gamepadBackend(() => pad(a), { timers }).play(two, 1);
    expect(a.effects).toHaveLength(1);
    expect(r.ms).toBe(160);
    timers.advance(99);
    expect(a.effects).toHaveLength(1);
    timers.advance(1);
    expect(a.effects).toHaveLength(2);
    expect(a.effects[1]).toMatchObject({ duration: 60, strongMagnitude: 0.4 });
  });

  it('cancels the chain when a new pattern preempts it, and on stop', () => {
    const a = actuator();
    const timers = fakeTimers();
    const b = gamepadBackend(() => pad(a), { timers });
    const late: HapticPattern = {
      events: [{ kind: 'transient', at: 100, intensity: 0.7, sharpness: 0.2 }],
    };
    b.play(late, 1);
    expect(timers.pending()).toBe(1);
    b.play(bonk, 1);
    expect(timers.pending()).toBe(0);
    timers.advance(500);
    expect(a.effects).toHaveLength(1);
    b.play(late, 1);
    b.stop();
    expect(timers.pending()).toBe(0);
    expect(a.resets).toBe(1);
    b.stop();
    expect(a.resets).toBe(1);
  });

  it('is unavailable, not an error, without a pad or a vibration actuator', () => {
    expect(gamepadBackend(() => null).caps()).toMatchObject({
      available: false,
      reason: 'no controller',
      target: 'controller',
    });
    const b = gamepadBackend(() => pad(null));
    expect(b.caps()).toMatchObject({ available: false, reason: 'this controller cannot rumble' });
    expect(b.play(bonk, 1)).toMatchObject({ ok: false, target: 'controller' });
    expect(gamepadBackend(() => pad(actuator()))).toBeDefined();
    expect(gamepadBackend(() => pad(actuator())).caps()).toMatchObject({
      available: true,
      name: 'Test Pad',
    });
    expect(() => {
      b.stop();
      b.dispose();
    }).not.toThrow();
  });

  it('swallows a rejected effect (a hidden page) and a throwing pad', async () => {
    const rejecting = actuator({ playEffect: () => Promise.reject(new Error('hidden')) });
    const throwing = actuator({
      playEffect: () => {
        throw new Error('gone');
      },
      reset: () => {
        throw new Error('gone');
      },
    });
    expect(gamepadBackend(() => pad(rejecting)).play(bonk, 1).ok).toBe(true);
    const t = gamepadBackend(() => pad(throwing));
    expect(t.play(bonk, 1).ok).toBe(true);
    expect(() => t.stop()).not.toThrow();
    await Promise.resolve();
  });

  it('plays nothing for a pattern that compiles to silence', () => {
    const a = actuator();
    const r = gamepadBackend(() => pad(a)).play(bonk, 0.01);
    expect(a.effects).toEqual([]);
    expect(r).toMatchObject({ ok: true, ms: 0 });
  });
});
