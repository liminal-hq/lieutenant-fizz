// Tests for the plugin haptic backend: the compile ladder and the backend with a fake `invoke`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { onTime, totalTime, type HapticPattern, type HapticTable } from './haptic-pattern';
import { PLUGIN_COMPILE, PLUGIN_LIMITS } from './haptic-plugin-compile';
import { GameHaptics } from './haptics';
import {
  adoptPlugin,
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
  it('applies the perceptual curve at tier 1 too', () => {
    const half: HapticPattern = { events: [tap(0, 0.5, 0.2)] };
    const at = (gamma: number, gain = 1) =>
      effectOf(
        compilePluginPattern(half, 1, caps(1), { compile: { ...PLUGIN_COMPILE, gamma, gain } }),
      );
    expect(at(0.2)).not.toEqual(at(1.5));
    const strong = at(0.2, 2) as { durationMs: number };
    const weak = at(1.5, 0.5) as { durationMs: number };
    expect(strong.durationMs).toBeGreaterThan(weak.durationMs);
    // A hum is shaped along its curve as well.
    const humAt = (gamma: number) =>
      effectOf(
        compilePluginPattern(hum, 1, caps(1), { compile: { ...PLUGIN_COMPILE, gamma, gain: 1 } }),
      );
    expect(humAt(0.2)).not.toEqual(humAt(1.5));
  });

  it('keeps the strength floor on the raw strength at tier 1', () => {
    const quiet: HapticPattern = { events: [tap(0, 0.05, 0.2)] };
    const plan = compilePluginPattern(quiet, 1, caps(1));
    expect(plan.call).toBeNull();
    const hair: HapticPattern = { events: [tap(0, 0.09, 0.2)] };
    expect(compilePluginPattern(hair, 1, caps(1)).call).not.toBeNull();
  });

  it('plays taps as primitives where the motor has them', () => {
    const plan = compilePluginPattern(double, 1, caps(3));
    expect(plan.tier).toBe(3);
    expect(plan.downgraded).toBe(false);
    expect(effectOf(plan)).toEqual({
      type: 'composition',
      steps: [
        { kind: 'primitive', primitive: 'thud', scale: 0.81 },
        { kind: 'primitive', primitive: 'thud', scale: 0.81, delayMs: 40 },
      ],
    });
  });

  it('picks the primitive by sharpness', () => {
    expect([0.9, 0.6, 0.3, 0.1].map((v) => primitiveFor(v))).toEqual([
      'tick',
      'click',
      'low_tick',
      'thud',
    ]);
  });

  it('swaps a missing primitive for a neighbour and says so', () => {
    const c = caps(3, { primitives: prim(['click']) });
    const plan = compilePluginPattern(bonk, 1, c);
    expect(effectOf(plan)).toMatchObject({ steps: [{ primitive: 'click' }] });
    expect(plan.reasons.join()).toMatch(/neighbouring primitive/);
  });

  it('scales the intensity and drops a tap under the floor', () => {
    const half = compilePluginPattern(bonk, 0.5, caps(3));
    expect(effectOf(half)).toMatchObject({ steps: [{ scale: 0.69 }] });
    const quiet = compilePluginPattern(bonk, 0.1, caps(3));
    expect(quiet.call).toBeNull();
    expect(quiet.reasons).toEqual(['Below the strength floor']);
  });

  it('lifts a tap with a perceptual curve and a floor, keeping Light, Medium and Strong apart', () => {
    // Jump is a tap of 0.5 at sharpness 0.7 (a click); the Strength settings scale it by 0.5, 0.75 and 1.
    const jump: HapticPattern = { events: [tap(0, 0.5, 0.7)] };
    const at = (master: number) =>
      (
        effectOf(compilePluginPattern(jump, master, caps(3))) as {
          steps: { primitive: string; scale: number }[];
        }
      ).steps[0];
    expect(at(1)).toEqual({ kind: 'primitive', primitive: 'click', scale: 0.86 });
    expect(at(0.75)).toMatchObject({ primitive: 'click', scale: 0.72 });
    expect(at(0.5)).toMatchObject({ primitive: 'click', scale: 0.57 });
    // Linear, the old compile sent 0.5, 0.38 and 0.25.
  });

  it('never sends a primitive below the primitive floor', () => {
    const faint: HapticPattern = { events: [tap(0, 0.08, 0.7)] };
    expect(effectOf(compilePluginPattern(faint, 1, caps(3)))).toMatchObject({
      steps: [{ scale: 0.3 }],
    });
    const tuned = { ...PLUGIN_COMPILE, primMin: 0.6 };
    expect(effectOf(compilePluginPattern(faint, 1, caps(3), { compile: tuned }))).toMatchObject({
      steps: [{ scale: 0.6 }],
    });
  });

  it('is the old linear compile when the curve is flat', () => {
    const flat = { ...PLUGIN_COMPILE, gamma: 1, gain: 1, primMin: 0, doubleAt: 2 };
    expect(effectOf(compilePluginPattern(bonk, 0.5, caps(3), { compile: flat }))).toMatchObject({
      steps: [{ scale: 0.35 }],
    });
  });

  it('counts the added thud in the compiled motor time', () => {
    const plan = compilePluginPattern({ events: [tap(0, 1, 0.6)] }, 1, caps(3));
    expect((effectOf(plan) as { steps: unknown[] }).steps).toHaveLength(2);
    // Two 20 ms primitives (the click and the thud) are all motor time; nothing is off.
    expect(onTime(plan.compiled as number[])).toBe(40);
    expect(totalTime(plan.compiled as number[])).toBe(plan.ms);
  });

  it('maps sharpness to heavier primitives when dull and crisp ones when sharp, tunably', () => {
    expect([1, 0.85, 0.7, 0.5, 0.4, 0.3, 0.29, 0].map((v) => primitiveFor(v))).toEqual([
      'tick',
      'tick',
      'click',
      'click',
      'low_tick',
      'low_tick',
      'thud',
      'thud',
    ]);
    expect(primitiveFor(0.7, { ...PLUGIN_COMPILE, tickAt: 0.6 })).toBe('tick');
  });

  it('follows the strongest taps with a thud, and not the others, a thud, or one crowded by the next tap', () => {
    const steps = (p: HapticPattern, master = 1) =>
      (
        effectOf(compilePluginPattern(p, master, caps(3))) as { steps: { primitive: string }[] }
      ).steps.map((x) => x.primitive);
    expect(steps({ events: [tap(0, 1, 0.6)] })).toEqual(['click', 'thud']);
    expect(steps({ events: [tap(0, 0.5, 0.6)] })).toEqual(['click']);
    expect(steps({ events: [tap(0, 1, 0.6)] }, 0.5)).toEqual(['click']);
    expect(steps({ events: [tap(0, 0.9, 0.1)] })).toEqual(['thud']);
    expect(steps({ events: [tap(0, 1, 0.6), tap(20, 1, 0.6)] })).toEqual([
      'click',
      'click',
      'thud',
    ]);
  });

  it('shapes the amplitude waveform with the same curve and a floor', () => {
    const c = caps(2);
    const wave = (compile?: typeof PLUGIN_COMPILE) =>
      effectOf(compilePluginPattern(bonk, 0.5, c, compile ? { compile } : {})) as {
        amplitudes: number[];
      };
    // 0.35 raw becomes 0.35^0.6 * 1.3 = 0.69, which is 177 of 255.
    expect(wave().amplitudes[0]).toBe(177);
    expect(wave({ ...PLUGIN_COMPILE, gamma: 1, gain: 1 }).amplitudes[0]).toBe(89);
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
    // 0.7 is curved to full strength by the defaults (gain 1.3, gamma 0.6), a 26 ms pulse.
    expect(effectOf(one)).toEqual({ type: 'oneshot', durationMs: 26 });
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
    if (cmd === 'plugin:phone-haptics|capabilities')
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
    expect(f.calls[0]?.cmd).toBe('plugin:phone-haptics|capabilities');
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
    expect(f.calls[1]?.cmd).toBe('plugin:phone-haptics|play');
    expect(b.lastResult()?.result).toBeUndefined();
    await settle();
    expect(b.lastResult()).toMatchObject({ at: 5, result: { tier: 3, policy: 'played' } });
    expect(seen).toHaveLength(1);
  });

  it('reports the on and off times so the budget counts only motor time', async () => {
    const sparse: HapticPattern = { events: [tap(0, 0.8, 0.2), tap(90, 0.8, 0.2)] };
    for (const [tier, extra] of [
      [4, { envelopeSupported: false }],
      [3, {}],
      [2, { compositionSupported: false }],
      [1, {}],
    ] as const) {
      const f = fake(caps(tier, extra));
      const b = pluginBackend({ invoke: f.invoke });
      await b.ready;
      const r = b.play(sparse, 1);
      expect(r.ok).toBe(true);
      const compiled = r.compiled as number[] | undefined;
      expect(compiled, `tier ${tier}`).toBeDefined();
      expect(onTime(compiled as number[]), `tier ${tier}`).toBeGreaterThan(0);
      expect(onTime(compiled as number[]), `tier ${tier}`).toBeLessThan(r.ms * 0.7);
      expect(totalTime(compiled as number[]), `tier ${tier}`).toBe(r.ms);
    }
  });

  it('reports on and off times for a hum at the envelope tier', async () => {
    const f = fake(caps(4));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    const r = b.play(hum, 1);
    expect(r.tier).toBe(4);
    const compiled = r.compiled as number[];
    expect(onTime(compiled)).toBeGreaterThan(0);
    expect(totalTime(compiled)).toBe(r.ms);
  });

  it('counts an envelope ramp down to zero as motor time', () => {
    const plan = compilePluginPattern(whoa, 1, caps(4));
    const eff = effectOf(plan) as {
      controlPoints: { amplitude: number; durationMs: number }[];
    };
    // A control point ramps from the previous amplitude to its own, so it is on unless both are zero.
    let prev = 0;
    let motor = 0;
    for (const pt of eff.controlPoints) {
      if (pt.amplitude > 0 || prev > 0) motor += pt.durationMs;
      prev = pt.amplitude;
    }
    const endpointOnly = eff.controlPoints.reduce(
      (a, p) => a + (p.amplitude > 0 ? p.durationMs : 0),
      0,
    );
    expect(motor).toBeGreaterThan(endpointOnly);
    expect(onTime(plan.compiled as number[])).toBe(motor);
    expect(totalTime(plan.compiled as number[])).toBe(plan.ms);
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
      'plugin:phone-haptics|capabilities',
      'plugin:phone-haptics|play',
      'plugin:phone-haptics|stop',
    ]);
    b.stop();
    expect(f.calls).toHaveLength(3);
  });

  it('plays a UI kind through the ui command', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    b.ui('toggle-on');
    expect(f.calls[1]).toEqual({ cmd: 'plugin:phone-haptics|ui', args: { kind: 'toggle-on' } });
  });
});

describe('tauriInvoke', () => {
  it('rejects, not throws, outside Tauri', async () => {
    await expect(tauriInvoke('plugin:phone-haptics|stop')).rejects.toThrow(
      'Tauri is not available',
    );
  });
});

describe('adoptPlugin', () => {
  const host = () => {
    const set: unknown[] = [];
    return { set, setBackends: (b: unknown) => void set.push(b) };
  };

  it('makes the plugin the phone backend inside the app when it has a vibrator', async () => {
    const h = host();
    const b = pluginBackend({ invoke: fake(caps(3)).invoke });
    expect(await adoptPlugin(h, b, true)).toBe(true);
    expect(h.set).toEqual([{ device: b }]);
  });

  it('leaves the web backend alone outside the app, without calling the plugin', async () => {
    const h = host();
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    expect(await adoptPlugin(h, b, false)).toBe(false);
    expect(h.set).toEqual([]);
  });

  it('leaves it alone when the plugin has no vibrator or fails', async () => {
    for (const c of [caps(0), new Error('denied')]) {
      const h = host();
      expect(await adoptPlugin(h, pluginBackend({ invoke: fake(c).invoke }), true)).toBe(false);
      expect(h.set).toEqual([]);
    }
  });
});

describe('menu cues through GameHaptics', () => {
  it('reach the phone as game-lane plays at the Strength setting, never the OS view haptics', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    const table: HapticTable = {
      cues: {
        'ui.select': {
          pattern: { events: [tap(0, 0.5, 0.8)] },
          priority: 1,
          cooldownMs: 0,
          policy: 'interrupt',
          lane: 'ui',
        },
      },
      captions: {},
    };
    let t = 0;
    const h = new GameHaptics(table, { now: () => t });
    h.setBackends({ device: b });
    h.setScale(1);
    h.ui('select');
    h.flush();
    t += 500;
    h.setScale(0.5);
    h.ui('select');
    h.flush();
    expect(
      f.calls.map((c) => c.cmd).filter((c) => c !== 'plugin:phone-haptics|capabilities'),
    ).toEqual(['plugin:phone-haptics|play', 'plugin:phone-haptics|play']);
    const scales = f.calls
      .filter((c) => c.cmd === 'plugin:phone-haptics|play')
      .map((c) => {
        const req = (c.args as { req: { effect: { steps: { scale: number }[] } } }).req;
        return req.effect.steps[0]?.scale ?? 0;
      });
    // Light is quieter than Strong, so the setting reaches menus.
    expect(scales[0]).toBeGreaterThan(scales[1] ?? 1);
  });
});

describe('pluginBackend tuning', () => {
  it('changes what the next play compiles to', async () => {
    const f = fake(caps(3));
    const b = pluginBackend({ invoke: f.invoke });
    await b.ready;
    const jump: HapticPattern = { events: [tap(0, 0.5, 0.7)] };
    const scale = () =>
      (f.calls.at(-1)?.args as { req: { effect: { steps: { scale: number }[] } } }).req.effect
        .steps[0]?.scale;
    b.play(jump, 1);
    expect(scale()).toBe(0.86);
    b.tunePlugin({ gamma: 1, gain: 1 });
    b.play(jump, 1);
    expect(scale()).toBe(0.5);
  });

  it('has a limit for every constant', () => {
    expect(Object.keys(PLUGIN_LIMITS).sort()).toEqual(Object.keys(PLUGIN_COMPILE).sort());
  });
});
