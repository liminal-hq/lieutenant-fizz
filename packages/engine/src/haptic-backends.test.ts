// Tests for the haptic backends with a stand-in `navigator`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { fakeBackend, noneBackend, vibrateBackend, type VibrateNavigator } from './haptic-backends';
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
