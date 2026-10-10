// Haptic backend for the Tauri haptics plugin: compiles patterns into the best request the phone's motor can play.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  VIBRATE_COMPILE,
  compileVibrate,
  sampleCurve,
  type HapticEvent,
  type HapticPattern,
} from './haptic-pattern';
import type { HapticBackend, HapticCaps, PlayResult } from './haptic-backends';

// ---------- The plugin's shapes (camelCase on the wire) ----------

/** A tier: 0 nothing, 1 on and off, 2 amplitude, 3 primitives, 4 envelope. */
export type PluginTier = 0 | 1 | 2 | 3 | 4;

export type PrimitiveId =
  'tick' | 'low_tick' | 'click' | 'thud' | 'spin' | 'quick_rise' | 'slow_rise';

export type PluginEffect =
  | { type: 'oneshot'; durationMs: number; amplitude?: number }
  | { type: 'waveform'; timingsMs: number[]; amplitudes?: number[]; repeat?: number }
  | { type: 'predefined'; effectId: string }
  | {
      type: 'composition';
      steps: { kind: 'primitive'; primitive: PrimitiveId; scale?: number; delayMs?: number }[];
    }
  | {
      type: 'envelopeWaveform';
      initialFrequencyHz?: number;
      controlPoints: { amplitude: number; frequencyHz: number; durationMs: number }[];
    };

export interface PluginRequest {
  effect: PluginEffect;
  usage?: string;
  stopBeforePlay?: boolean;
}

/** The part of the plugin's `capabilities()` result the compiler reads. */
export interface PluginCaps {
  platform?: string;
  sdkInt?: number;
  hasVibrator: boolean;
  hasAmplitudeControl: boolean;
  topTier: PluginTier;
  compositionSupported: boolean;
  primitives: Partial<Record<PrimitiveId, { supported: boolean; durationMs: number | null }>>;
  /** Predefined effects (API 30 and up), by id. */
  effects?: Record<string, 'yes' | 'no' | 'unknown'>;
  envelopeSupported: boolean;
  envelopeInfo?: {
    maxSize: number;
    minControlPointDurationMs: number;
    maxControlPointDurationMs: number;
    maxDurationMs: number;
    frequencyProfile?: { minHz: number; maxHz: number };
  };
  resonantHz?: number;
  touchFeedbackEnabled?: boolean | null;
  limits?: { maxDurationMs: number; maxAmplitude: number; allowRepeatingWaveforms: boolean };
  device?: { manufacturer: string; model: string; release: string };
}

/** What `play` and `play_steps` resolve with. */
export interface PluginPlayResult {
  ok: boolean;
  tier: PluginTier;
  target?: string;
  estimatedMs: number;
  downgraded: boolean;
  reason?: string;
  policy?: 'played' | 'queued' | 'dropped' | 'coalesced';
}

/** A call to the plugin, as `invoke` takes it. */
export type PluginCall =
  | { cmd: 'plugin:haptics|play'; args: { req: PluginRequest; scale?: number; maxTier?: number } }
  | {
      cmd: 'plugin:haptics|play_steps';
      args: {
        steps: { atMs: number; request: PluginRequest }[];
        scale?: number;
        maxTier?: number;
      };
    };

/** `invoke` from Tauri, or a stand-in for tests. */
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Tauri's `invoke`, looked up when first used so the web bundle never touches it. */
export const tauriInvoke: Invoke = (cmd, args) => {
  const g = globalThis as { __TAURI_INTERNALS__?: { invoke?: Invoke } };
  const fn = g.__TAURI_INTERNALS__?.invoke;
  if (typeof fn !== 'function') return Promise.reject(new Error('Tauri is not available'));
  return fn(cmd, args);
};

// ---------- Compile ----------

/** Tunable constants of the plugin compiler. */
export interface PluginCompile {
  /** Intensity below this plays nothing. */
  floor: number;
  /** Length of one slice of a hum in a waveform, in ms. */
  slice: number;
  /** The longest effect sent, in ms. */
  maxMs: number;
}

export const PLUGIN_COMPILE: Readonly<PluginCompile> = { floor: 0.08, slice: 20, maxMs: 1000 };

/** What the compiler decided: the call (null when nothing plays), the tier used and why it was not higher. */
export interface PluginPlan {
  tier: PluginTier;
  call: PluginCall | null;
  /** Estimated length of the effect, in ms. */
  ms: number;
  /** Less than the pattern asked for: the device or the tier cap stepped it down. */
  downgraded: boolean;
  reasons: string[];
}

const hasContinuous = (p: HapticPattern): boolean => p.events.some((e) => e.kind === 'continuous');

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round = (x: number): number => Math.floor(x + 0.5 + 1e-9);

/** The primitive a tap of this sharpness is closest to, and the others to try if the motor lacks it. */
const PRIMITIVE_ORDER: Record<string, PrimitiveId[]> = {
  tick: ['tick', 'click', 'low_tick', 'thud'],
  low_tick: ['low_tick', 'tick', 'click', 'thud'],
  click: ['click', 'tick', 'thud', 'low_tick'],
  thud: ['thud', 'click', 'low_tick', 'tick'],
};

/** Typical lengths of the primitives, used when the motor has not measured them. */
const PRIMITIVE_MS: Record<PrimitiveId, number> = {
  tick: 10,
  low_tick: 12,
  click: 15,
  thud: 30,
  spin: 90,
  quick_rise: 60,
  slow_rise: 150,
};

/** The primitive a tap of this sharpness wants: crisp is a tick, dull is a thud. */
export function primitiveFor(sharpness: number): PrimitiveId {
  if (sharpness >= 0.75) return 'tick';
  if (sharpness >= 0.45) return 'click';
  if (sharpness >= 0.25) return 'low_tick';
  return 'thud';
}

function pickPrimitive(wanted: PrimitiveId, caps: PluginCaps): PrimitiveId | null {
  for (const id of PRIMITIVE_ORDER[wanted] ?? []) if (caps.primitives[id]?.supported) return id;
  return null;
}

const primitiveMs = (id: PrimitiveId, caps: PluginCaps): number =>
  caps.primitives[id]?.durationMs ?? PRIMITIVE_MS[id];

interface Attempt {
  effect: PluginEffect | null;
  ms: number;
  /** Why this tier could not play the pattern; set when `effect` is null. */
  why?: string;
  note?: string;
}

/** Tier 3: a tap is a primitive. Only for patterns of taps; a hum has no primitive to stand in for it. */
function composition(p: HapticPattern, scale: number, caps: PluginCaps, c: PluginCompile): Attempt {
  if (!caps.compositionSupported)
    return { effect: null, ms: 0, why: 'no primitives on this motor' };
  if (hasContinuous(p)) return { effect: null, ms: 0, why: 'a hum has no primitive' };
  const taps = p.events
    .filter((e): e is Extract<HapticEvent, { kind: 'transient' }> => e.kind === 'transient')
    .sort((a, b) => a.at - b.at);
  const steps: Extract<PluginEffect, { type: 'composition' }>['steps'] = [];
  let end = 0;
  let notes = 0;
  for (const t of taps) {
    const i = clamp01(t.intensity * scale);
    if (i < c.floor) continue;
    const want = primitiveFor(t.sharpness);
    const id = pickPrimitive(want, caps);
    if (!id) return { effect: null, ms: 0, why: 'no primitive is supported' };
    if (id !== want) notes++;
    const delay = Math.max(0, round(t.at - end));
    steps.push({
      kind: 'primitive',
      primitive: id,
      scale: Math.round(i * 100) / 100,
      ...(delay > 0 ? { delayMs: delay } : {}),
    });
    end = Math.max(end, t.at) + primitiveMs(id, caps);
    if (delay === 0 && t.at < end - primitiveMs(id, caps)) notes++;
  }
  if (steps.length === 0) return { effect: null, ms: 0, why: 'below the strength floor' };
  return {
    effect: { type: 'composition', steps },
    ms: Math.round(end),
    ...(notes > 0 ? { note: 'Some taps use a neighbouring primitive or start late' } : {}),
  };
}

/** Tier 2: one waveform of amplitude steps. Taps become short bursts, hums are sampled along their curves. */
function amplitudeWaveform(
  p: HapticPattern,
  scale: number,
  caps: PluginCaps,
  c: PluginCompile,
): Attempt {
  if (!caps.hasAmplitudeControl) return { effect: null, ms: 0, why: 'no amplitude control' };
  const maxMs = Math.min(c.maxMs, caps.limits?.maxDurationMs ?? c.maxMs);
  const maxAmp = Math.min(255, caps.limits?.maxAmplitude ?? 255);
  // A grid of `step` ms cells holding the strongest amplitude wanted in each.
  const step = 5;
  const cells: number[] = [];
  const paint = (from: number, to: number, amp: number): void => {
    const a = Math.floor(from / step);
    const b = Math.max(a + 1, Math.ceil(to / step));
    for (let k = a; k < b && k * step < maxMs; k++) cells[k] = Math.max(cells[k] ?? 0, amp);
  };
  const amplitudeOf = (i: number): number =>
    Math.min(maxAmp, Math.max(1, Math.round(clamp01(i) * 255)));
  for (const e of p.events) {
    if (e.kind === 'transient') {
      const i = clamp01(e.intensity * scale);
      if (i < c.floor) continue;
      const len = Math.max(
        VIBRATE_COMPILE.minOn,
        round((VIBRATE_COMPILE.tBase + VIBRATE_COMPILE.tSpan * i) * (1.15 - 0.3 * e.sharpness)),
      );
      paint(e.at, e.at + len, amplitudeOf(i));
      continue;
    }
    for (let off = 0; off < e.duration; off += c.slice) {
      const len = Math.min(c.slice, e.duration - off);
      const i = clamp01(sampleCurve(e.intensity, off + len / 2) * scale);
      if (i < c.floor) continue;
      paint(e.at + off, e.at + off + len, amplitudeOf(i));
    }
  }
  const timings: number[] = [];
  const amps: number[] = [];
  let k = 0;
  while (k < cells.length) {
    const amp = cells[k] ?? 0;
    let j = k + 1;
    while (j < cells.length && (cells[j] ?? 0) === amp) j++;
    timings.push((j - k) * step);
    amps.push(amp);
    k = j;
  }
  while (amps.length > 0 && amps[amps.length - 1] === 0) {
    amps.pop();
    timings.pop();
  }
  if (amps.length === 0) return { effect: null, ms: 0, why: 'below the strength floor' };
  const ms = timings.reduce((a, b) => a + b, 0);
  return { effect: { type: 'waveform', timingsMs: timings, amplitudes: amps }, ms };
}

/** Tier 1: on and off, from the same compiler `navigator.vibrate` uses. */
function onOff(p: HapticPattern, scale: number, caps: PluginCaps, c: PluginCompile): Attempt {
  if (!caps.hasVibrator) return { effect: null, ms: 0, why: 'no vibrator' };
  const maxMs = Math.min(c.maxMs, caps.limits?.maxDurationMs ?? c.maxMs);
  const arr = compileVibrate(p, scale, { ...VIBRATE_COMPILE, floor: c.floor, maxMs });
  if (arr.length === 0) return { effect: null, ms: 0, why: 'below the strength floor' };
  const ms = arr.reduce((a, b) => a + b, 0);
  if (arr.length === 1) return { effect: { type: 'oneshot', durationMs: arr[0] as number }, ms };
  // `navigator.vibrate` starts with on; the plugin's waveform starts with off.
  return { effect: { type: 'waveform', timingsMs: [0, ...arr] }, ms };
}

/** Tier 4: an envelope of control points, for patterns with hums. */
function envelope(p: HapticPattern, scale: number, caps: PluginCaps, c: PluginCompile): Attempt {
  const info = caps.envelopeInfo;
  if (!caps.envelopeSupported || !info) return { effect: null, ms: 0, why: 'no envelope support' };
  if (!hasContinuous(p)) return { effect: null, ms: 0, why: 'taps play better as primitives' };
  const minCp = Math.max(1, info.minControlPointDurationMs);
  const maxCp = Math.max(minCp, info.maxControlPointDurationMs);
  const maxTotal = Math.min(info.maxDurationMs, c.maxMs, caps.limits?.maxDurationMs ?? c.maxMs);
  const prof = info.frequencyProfile;
  const freqOf = (sharp: number): number => {
    if (!prof) return caps.resonantHz ?? 150;
    return Math.round(prof.minHz + clamp01(sharp) * (prof.maxHz - prof.minHz));
  };
  const events = [...p.events].sort((a, b) => a.at - b.at);
  const firstSharp = events[0] ? sampleCurve(events[0].sharpness, 0) : 0.5;

  type Point = { amplitude: number; frequencyHz: number; durationMs: number };
  const build = (sliceMs: number): { pts: Point[]; ms: number } => {
    const pts: Point[] = [];
    let cursor = 0;
    let level = 0;
    let freq = freqOf(firstSharp);
    const push = (amplitude: number, frequencyHz: number, durationMs: number): void => {
      pts.push({ amplitude: Math.round(amplitude * 100) / 100, frequencyHz, durationMs });
      cursor += durationMs;
      level = amplitude;
      freq = frequencyHz;
    };
    const silence = (until: number): void => {
      let gap = until - cursor;
      while (gap >= minCp) {
        const d = Math.min(maxCp, gap);
        push(0, freq, d);
        gap -= d;
      }
    };
    for (const e of events) {
      silence(e.at);
      if (e.kind === 'transient') {
        const i = clamp01(e.intensity * scale);
        if (i < c.floor) continue;
        const f = freqOf(e.sharpness);
        push(i, f, minCp);
        push(0, f, minCp);
        continue;
      }
      const mark = pts.length;
      const markCursor = cursor;
      let any = false;
      for (let off = 0; off < e.duration; off += sliceMs) {
        const len = Math.min(sliceMs, e.duration - off);
        if (len < minCp && off > 0) break;
        const i = clamp01(sampleCurve(e.intensity, off + len) * scale);
        if (i >= c.floor) any = true;
        const f = freqOf(sampleCurve(e.sharpness, off + len / 2));
        push(i >= c.floor ? i : 0, f, Math.min(maxCp, Math.max(minCp, len)));
      }
      if (!any) {
        // Nothing to feel in this hum: take it back out.
        pts.length = mark;
        cursor = markCursor;
        level = 0;
        continue;
      }
      if (level > 0) push(0, freq, minCp);
    }
    // Keep one closing ramp to zero, but not a run of silence after it.
    while (
      pts.length > 1 &&
      pts[pts.length - 1]?.amplitude === 0 &&
      pts[pts.length - 2]?.amplitude === 0
    ) {
      cursor -= (pts.pop() as Point).durationMs;
    }
    return { pts, ms: cursor };
  };

  for (const sliceMs of [c.slice, c.slice * 2, c.slice * 4].map((v) => Math.max(minCp, v))) {
    const r = build(sliceMs);
    if (r.pts.every((pt) => pt.amplitude === 0))
      return { effect: null, ms: 0, why: 'below the strength floor' };
    if (r.pts.length > info.maxSize || r.ms > maxTotal) continue;
    return {
      effect: {
        type: 'envelopeWaveform',
        ...(prof ? { initialFrequencyHz: freqOf(firstSharp) } : {}),
        controlPoints: r.pts,
      },
      ms: r.ms,
    };
  }
  return { effect: null, ms: 0, why: 'too long or too many points for the envelope limits' };
}

/**
 * Compiles a pattern into one plugin call at the best tier the device and `maxTier` allow, stepping down
 * (envelope, primitives, amplitude waveform, on and off) with a reason for each step. `scale` multiplies every
 * intensity. A pattern with nothing to feel at that scale gives a plan with no call. Pure.
 */
export function compilePluginPattern(
  p: HapticPattern,
  scale: number,
  caps: PluginCaps,
  opts: { maxTier?: PluginTier | null; compile?: Readonly<PluginCompile> } = {},
): PluginPlan {
  const c = opts.compile ?? PLUGIN_COMPILE;
  const cap = opts.maxTier ?? 4;
  const reasons: string[] = [];
  if (!caps.hasVibrator || caps.topTier === 0)
    return {
      tier: 0,
      call: null,
      ms: 0,
      downgraded: false,
      reasons: ['No vibrator on this device'],
    };
  const ideal: PluginTier = hasContinuous(p) ? 4 : 3;
  const ceiling = Math.min(caps.topTier, cap) as PluginTier;
  if (cap < caps.topTier) reasons.push(`Capped at tier ${cap}`);
  const tries: [
    PluginTier,
    (p: HapticPattern, s: number, c: PluginCaps, k: PluginCompile) => Attempt,
  ][] = [
    [4, envelope],
    [3, composition],
    [2, amplitudeWaveform],
    [1, onOff],
  ];
  const s = Math.max(0, scale);
  for (const [tier, fn] of tries) {
    if (tier > ceiling) continue;
    const a = fn(p, s, caps, c);
    if (!a.effect) {
      if (a.why === 'below the strength floor') {
        return {
          tier,
          call: null,
          ms: 0,
          downgraded: false,
          reasons: [...reasons, 'Below the strength floor'],
        };
      }
      // A tier skipped because the pattern suits another one is not worth reporting.
      if (a.why !== 'taps play better as primitives') reasons.push(`Tier ${tier}: ${a.why}`);
      continue;
    }
    if (a.note) reasons.push(a.note);
    const call: PluginCall = {
      cmd: 'plugin:haptics|play',
      args: {
        req: { effect: a.effect },
        ...(opts.maxTier !== undefined && opts.maxTier !== null ? { maxTier: opts.maxTier } : {}),
      },
    };
    return { tier, call, ms: a.ms, downgraded: tier < ideal, reasons };
  }
  return {
    tier: 0,
    call: null,
    ms: 0,
    downgraded: true,
    reasons: [...reasons, 'Nothing could play it'],
  };
}

// ---------- Backend ----------

/** One play as the page and the tests see it: what was compiled, what was sent, what came back. */
export interface PluginRecord {
  at: number;
  plan: PluginPlan;
  /** What `play()` returned straight away. */
  estimate: PlayResult;
  /** What the plugin resolved with, once it did. */
  result?: PluginPlayResult;
  /** Why the call failed, once it did. */
  error?: string;
}

/** The plugin backend, with what the page needs beyond `HapticBackend`. */
export interface PluginBackend extends HapticBackend {
  /** Resolves with the plugin's capabilities once they are read (or null if reading failed). */
  readonly ready: Promise<PluginCaps | null>;
  /** The capabilities as read, or null before then. */
  capabilities(): PluginCaps | null;
  /** Caps the tier played (0 to 4), or removes the cap with null. The cap is also sent to the plugin. */
  setMaxTier(tier: PluginTier | null): void;
  /** The most recent play, or null. */
  lastResult(): PluginRecord | null;
  /** Calls `fn` each time a play settles (the plugin answered or failed). Returns an unsubscribe. */
  onResult(fn: (r: PluginRecord) => void): () => void;
  /** Plays a UI-lane kind through the system's view haptics (`plugin:haptics|ui`). */
  ui(kind: 'confirm' | 'reject' | 'tick' | 'toggle-on' | 'toggle-off' | 'drag-start'): void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Plays patterns through the Tauri haptics plugin. `invoke` defaults to Tauri's own, looked up when first
 * called. Capabilities are read once at creation (`ready`); until then, and when there is no vibrator, the
 * backend reports itself unavailable. `play` fires the call and returns an estimate straight away; the
 * plugin's own answer arrives in `lastResult()` and `onResult`. Nothing here throws or rejects.
 */
export function pluginBackend(
  opts: { invoke?: Invoke; compile?: Readonly<PluginCompile>; now?: () => number } = {},
): PluginBackend {
  const invoke = opts.invoke ?? tauriInvoke;
  const compile: PluginCompile = { ...(opts.compile ?? PLUGIN_COMPILE) };
  const now = opts.now ?? (() => Date.now());
  let caps: PluginCaps | null = null;
  let failed: string | null = null;
  let maxTier: PluginTier | null = null;
  let sent = false;
  let last: PluginRecord | null = null;
  const listeners = new Set<(r: PluginRecord) => void>();

  const call = (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    try {
      return Promise.resolve(invoke(cmd, args));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const emit = (r: PluginRecord): void => {
    last = r;
    for (const fn of [...listeners]) {
      try {
        fn(r);
      } catch {
        /* a listener that throws is not the backend's problem */
      }
    }
  };

  const ready = call('plugin:haptics|capabilities').then(
    (r) => {
      caps = r as PluginCaps;
      return caps;
    },
    (e) => {
      failed = message(e);
      return null;
    },
  );

  const fail = (reason: string): PlayResult => ({
    ok: false,
    tier: 0,
    downgraded: false,
    target: 'device',
    reason,
    ms: 0,
  });

  const backendCaps = (): HapticCaps => {
    if (failed)
      return { id: 'plugin', available: false, reason: failed, tier: 0, target: 'device' };
    if (!caps)
      return {
        id: 'plugin',
        available: false,
        reason: 'reading capabilities',
        tier: 0,
        target: 'device',
      };
    if (!caps.hasVibrator || caps.topTier === 0)
      return { id: 'plugin', available: false, reason: 'no vibrator', tier: 0, target: 'device' };
    return {
      id: 'plugin',
      available: true,
      tier: caps.topTier,
      target: 'device',
      ...(caps.device ? { name: `${caps.device.manufacturer} ${caps.device.model}` } : {}),
    };
  };

  return {
    ready,
    caps: backendCaps,
    capabilities: () => caps,
    setMaxTier(tier) {
      maxTier = tier;
    },
    lastResult: () => last,
    onResult(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    play(p, scale) {
      const c = backendCaps();
      if (!c.available || !caps) return fail(c.reason ?? 'unavailable');
      let plan: PluginPlan;
      try {
        plan = compilePluginPattern(p, scale, caps, { maxTier, compile });
      } catch (e) {
        return fail(`could not compile: ${message(e)}`);
      }
      const reason = plan.reasons.length > 0 ? plan.reasons.join(' · ') : undefined;
      const estimate: PlayResult = {
        ok: true,
        tier: plan.tier,
        downgraded: plan.downgraded,
        target: 'device',
        ...(reason ? { reason } : {}),
        ms: plan.ms,
      };
      const record: PluginRecord = { at: now(), plan, estimate };
      if (!plan.call) {
        emit(record);
        return estimate;
      }
      sent = true;
      last = record;
      call(plan.call.cmd, plan.call.args as unknown as Record<string, unknown>).then(
        (r) => emit({ ...record, result: r as PluginPlayResult }),
        (e) => emit({ ...record, error: message(e) }),
      );
      return estimate;
    },
    ui(kind) {
      void call('plugin:haptics|ui', { kind }).catch(() => {});
    },
    stop() {
      if (!sent) return;
      sent = false;
      void call('plugin:haptics|stop').catch(() => {});
    },
    dispose() {
      this.stop();
      listeners.clear();
    },
  };
}

/** The part of `GameHaptics` that `adoptPlugin` uses. */
export interface DeviceBackendHost {
  setBackends(b: { device?: HapticBackend }): void;
}

/**
 * Makes the plugin the phone's backend when the page runs inside the Tauri app and the plugin reports a
 * working vibrator; anywhere else, or when the plugin is missing, denied or reports no vibrator, the
 * backend in place stays. Resolves with whether the plugin was adopted. Never rejects.
 */
export async function adoptPlugin(
  host: DeviceBackendHost,
  plugin: PluginBackend,
  inApp: boolean,
): Promise<boolean> {
  if (!inApp) {
    plugin.dispose();
    return false;
  }
  await plugin.ready;
  if (!plugin.caps().available) {
    plugin.dispose();
    return false;
  }
  host.setBackends({ device: plugin });
  return true;
}
