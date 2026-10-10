// Tests for the plugin haptic backend: the compile ladder and the backend with a fake `invoke`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { HapticPattern } from './haptic-pattern';
import {
  compilePluginPattern,
  pluginBackend,
  primitiveFor,
  tauriInvoke,
  type Invoke,
  type PluginCaps,
  type PluginTier,
} from './haptic-plugin';

const tap = (at: number, intensity: number, sharpness: number) =>
  ({ kind: 'transient', at, intensity, sharpness }) as const;

const bonk: HapticPattern = { events: [tap(0, 0.7, 0.2)] };
const double: HapticPattern = { events: [tap(0, 0.45, 0.2), tap(60, 0.45, 0.2)] };
const hum: HapticPattern = {
  events: [
    {
      kind: 'continuous',
      at: 0,
      duration: 100,
      intensity: [
        { t: 0, v: 0.9 },
        { t: 100, v: 0 },
      ],
      sharpness: 0.1,
    },
  ],
};
const whoa: HapticPattern = {
  events: [tap(0, 1, 0.6), ...hum.events.map((e) => ({ ...e, at: 25 }))],
};

const prim = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, { supported: true, durationMs: 20 }]));

function caps(tier: PluginTier, extra: Partial<PluginCaps> = {}): PluginCaps {
  const base: PluginCaps = {
    hasVibrator: tier > 0,
    hasAmplitudeControl: tier >= 2,
    topTier: tier,
    compositionSupported: tier >= 3,
    primitives: tier >= 3 ? prim(['tick', 'click', 'thud', 'low_tick']) : {},
    envelopeSupported: tier >= 4,
    ...(tier >= 4
      ? {
          envelopeInfo: {
            maxSize: 16,
            minControlPointDurationMs: 10,
            maxControlPointDurationMs: 100,
            maxDurationMs: 1000,
            frequencyProfile: { minHz: 50, maxHz: 250 },
          },
        }
      : {}),
    limits: { maxDurationMs: 10000, maxAmplitude: 255, allowRepeatingWaveforms: false },
    device: { manufacturer: 'Google', model: 'Pixel 8 Pro', release: '17' },
  };
  return { ...base, ...extra };
}

const effectOf = (plan: ReturnType<typeof compilePluginPattern>) =>
  plan.call && 'req' in plan.call.args ? plan.call.args.req.effect : null;

describe('compilePluginPattern', () => {
  it('plays taps as primitives where the motor has them', () => {
    const plan = compilePluginPattern(double, 1, caps(3));
    expect(plan.tier).toBe(3);
    expect(plan.downgraded).toBe(false);
    expect(effectOf(plan)).toEqual({
      type: 'composition',
      steps: [
        { kind: 'primitive', primitive: 'thud', scale: 0.45 },
        { kind: 'primitive', primitive: 'thud', scale: 0.45, delayMs: 40 },
      ],
    });
  });

  it('picks the primitive by sharpness', () => {
    expect([0.9, 0.6, 0.3, 0.1].map(primitiveFor)).toEqual(['tick', 'click', 'low_tick', 'thud']);
  });

  it('swaps a missing primitive for a neighbour and says so', () => {
    const c = caps(3, { primitives: prim(['click']) });
    const plan = compilePluginPattern(bonk, 1, c);
    expect(effectOf(plan)).toMatchObject({ steps: [{ primitive: 'click' }] });
    expect(plan.reasons.join()).toMatch(/neighbouring primitive/);
  });

  it('scales the intensity and drops a tap under the floor', () => {
    const half = compilePluginPattern(bonk, 0.5, caps(3));
    expect(effectOf(half)).toMatchObject({ steps: [{ scale: 0.35 }] });
    const quiet = compilePluginPattern(bonk, 0.1, caps(3));
    expect(quiet.call).toBeNull();
    expect(quiet.reasons).toEqual(['Below the strength floor']);
  });

  it('plays a hum as an envelope on the top tier, with the sharpness as frequency', () => {
    const plan = compilePluginPattern(hum, 1, caps(4));
    expect(plan.tier).toBe(4);
    const e = effectOf(plan);
    expect(e).toMatchObject({ type: 'envelopeWaveform', initialFrequencyHz: 70 });
    const pts = (e as { controlPoints: { amplitude: number; frequencyHz: number }[] })
      .controlPoints;
    expect(pts[0]?.amplitude).toBeGreaterThan(0.5);
    expect(pts.every((p) => p.frequencyHz >= 50 && p.frequencyHz <= 250)).toBe(true);
    expect(pts.length).toBeLessThanOrEqual(16);
    expect(pts[pts.length - 1]?.amplitude).toBe(0);
  });

  it('still plays taps as primitives on the top tier', () => {
    const plan = compilePluginPattern(bonk, 1, caps(4));
    expect(plan.tier).toBe(3);
    expect(plan.downgraded).toBe(false);
  });

  it('steps a hum down to an amplitude waveform without an envelope', () => {
    const plan = compilePluginPattern(hum, 1, caps(3, { hasAmplitudeControl: true }));
    expect(plan.tier).toBe(2);
    expect(plan.downgraded).toBe(true);
    expect(plan.reasons.join()).toMatch(/a hum has no primitive/);
    const e = effectOf(plan) as { timingsMs: number[]; amplitudes: number[] };
    expect(e.timingsMs).toHaveLength(e.amplitudes.length);
    expect(e.amplitudes[0]).toBeGreaterThan(150);
    expect(Math.max(...e.amplitudes)).toBeLessThanOrEqual(255);
  });

  it('builds a mixed pattern into one amplitude waveform with a gap', () => {
    const p: HapticPattern = { events: [tap(0, 0.8, 0.5), tap(40, 0.8, 0.5)] };
    const plan = compilePluginPattern(p, 1, caps(2));
    const e = effectOf(plan) as { timingsMs: number[]; amplitudes: number[] };
    expect(plan.tier).toBe(2);
    expect(e.amplitudes.includes(0)).toBe(true);
    expect(e.timingsMs.reduce((a, b) => a + b, 0)).toBe(plan.ms);
  });

  it('falls back to on and off, as a oneshot for one pulse and a waveform for more', () => {
    const one = compilePluginPattern(bonk, 1, caps(1));
    expect(effectOf(one)).toEqual({ type: 'oneshot', durationMs: 21 });
    expect(one.tier).toBe(1);
    const two = compilePluginPattern(double, 1, caps(1));
    const e = effectOf(two) as { timingsMs: number[] };
    expect(e.timingsMs[0]).toBe(0);
    expect(e.timingsMs.length).toBeGreaterThan(2);
  });

  it('honours the tier cap and reports it', () => {
    const plan = compilePluginPattern(hum, 1, caps(4), { maxTier: 1 });
    expect(plan.tier).toBe(1);
    expect(plan.downgraded).toBe(true);
    expect(plan.reasons[0]).toBe('Capped at tier 1');
    expect(plan.call?.args.maxTier).toBe(1);
  });

  it('plays nothing with a cap of 0 or no vibrator', () => {
    expect(compilePluginPattern(bonk, 1, caps(4), { maxTier: 0 }).call).toBeNull();
    const none = compilePluginPattern(bonk, 1, caps(0));
    expect(none.call).toBeNull();
    expect(none.reasons).toEqual(['No vibrator on this device']);
  });

  it('steps an over-long envelope down a tier', () => {
    const long: HapticPattern = {
      events: [{ kind: 'continuous', at: 0, duration: 5000, intensity: 0.5, sharpness: 0.5 }],
    };
    const plan = compilePluginPattern(long, 1, caps(4));
    expect(plan.tier).toBe(2);
    expect(plan.reasons.join()).toMatch(/Tier 4/);
  });

  it('compiles the whoa cue (a tap and a hum) in one envelope', () => {
    const plan = compilePluginPattern(whoa, 1, caps(4));
    expect(plan.tier).toBe(4);
    expect(plan.ms).toBeGreaterThan(100);
  });
});

function fake(
  c: PluginCaps | Error,
  answer: unknown = { ok: true, tier: 3, estimatedMs: 20, downgraded: false },
) {
  const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
  let reject: Error | null = null;
  const invoke: Invoke = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'plugin:haptics|capabilities')
      return c instanceof Error ? Promise.reject(c) : Promise.resolve(c);
    if (reject) return Promise.reject(reject);
    return Promise.resolve(answer);
  };
  return { invoke, calls, rejectWith: (e: Error) => (reject = e) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('pluginBackend', () => {
  it('reads the capabilities and reports itself available', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    expect(b.caps()).toMatchObject({ id: 'plugin', available: false });
    await b.ready;
    expect(b.caps()).toEqual({
      id: 'plugin',
      available: true,
      tier: 3,
      target: 'device',
      name: 'Google Pixel 8 Pro',
    });
    expect(f.calls[0]?.cmd).toBe('plugin:haptics|capabilities');
  });

  it('is unavailable with no vibrator, and when the capabilities call fails', async () => {
    const none = pluginBackend({ invoke: fake(caps(0)).invoke });
    await none.ready;
    expect(none.caps()).toMatchObject({ available: false, reason: 'no vibrator' });
    const bad = pluginBackend({ invoke: fake(new Error('denied')).invoke });
    await bad.ready;
    expect(bad.caps()).toMatchObject({ available: false, reason: 'denied' });
    expect(bad.play(bonk, 1)).toMatchObject({ ok: false, reason: 'denied' });
  });

  it('fires the play call, returns an estimate at once and records the real answer', async () => {
    const f = fake(caps(3), {
      ok: true,
      tier: 3,
      estimatedMs: 20,
      downgraded: false,
      policy: 'played',
    });
    const b = pluginBackend({ invoke: f.invoke, now: () => 5 });
    await b.ready;
    const seen: unknown[] = [];
    b.onResult((r) => seen.push(r));
    const r = b.play(bonk, 1);
    expect(r).toMatchObject({ ok: true, tier: 3, downgraded: false, target: 'device' });
    expect(r.ms).toBeGreaterThan(0);
    expect(f.calls[1]?.cmd).toBe('plugin:haptics|play');
    expect(b.lastResult()?.result).toBeUndefined();
    await settle();
    expect(b.lastResult()).toMatchObject({ at: 5, result: { tier: 3, policy: 'played' } });
    expect(seen).toHaveLength(1);
  });

  it('sends the tier cap to the plugin', async () => {
    const f = fake(caps(4));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    b.setMaxTier(2);
    const r = b.play(hum, 1);
    expect(r.tier).toBe(2);
    expect(f.calls[1]?.args).toMatchObject({ maxTier: 2 });
    b.setMaxTier(null);
    b.play(hum, 1);
    expect(f.calls[2]?.args).not.toHaveProperty('maxTier');
  });

  it('never throws when the plugin rejects or invoke throws', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    f.rejectWith(new Error('INVALID_EFFECT'));
    expect(b.play(bonk, 1).ok).toBe(true);
    await settle();
    expect(b.lastResult()?.error).toBe('INVALID_EFFECT');
    const boom = pluginBackend({
      invoke: (cmd) => {
        if (cmd.endsWith('capabilities')) return Promise.resolve(caps(3));
        throw new Error('sync');
      },
    });
    await boom.ready;
    expect(() => boom.play(bonk, 1)).not.toThrow();
    expect(() => boom.stop()).not.toThrow();
    expect(() => boom.ui('tick')).not.toThrow();
    await settle();
    expect(boom.lastResult()?.error).toBe('sync');
  });

  it('sends nothing for a silent pattern, and stops only after something played', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    b.stop();
    expect(f.calls).toHaveLength(1);
    const r = b.play(bonk, 0.05);
    expect(r).toMatchObject({ ok: true, ms: 0, reason: 'Below the strength floor' });
    expect(f.calls).toHaveLength(1);
    b.play(bonk, 1);
    b.stop();
    expect(f.calls.map((c) => c.cmd)).toEqual([
      'plugin:haptics|capabilities',
      'plugin:haptics|play',
      'plugin:haptics|stop',
    ]);
    b.stop();
    expect(f.calls).toHaveLength(3);
  });

  it('plays a UI kind through the ui command', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    b.ui('toggle-on');
    expect(f.calls[1]).toEqual({ cmd: 'plugin:haptics|ui', args: { kind: 'toggle-on' } });
  });
});

describe('tauriInvoke', () => {
  it('rejects, not throws, outside Tauri', async () => {
    await expect(tauriInvoke('plugin:haptics|stop')).rejects.toThrow('Tauri is not available');
  });
});
