// The haptics page's plugin smoke-test cases (requests and verdicts) and the user-agent reader, kept apart from the DOM so they can be tested.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { PluginCaps, PluginPlayResult } from '@lieutenant-fizz/engine/haptic-plugin';

/** One call to the plugin: the command and its camelCase arguments. */
export interface RawCall {
  cmd: string;
  args?: Record<string, unknown>;
}

/** What one call came to: the plugin's result, or the text it rejected with. */
export interface Outcome {
  call: RawCall;
  result?: PluginPlayResult;
  error?: string;
}

export type Verdict = 'ok' | 'check';

/** A smoke case run over raw IPC (cases 1 to 8; case 9 goes through the JS guest). */
export interface SmokeCase {
  id: number;
  title: string;
  /** What the plugin author expects, in a sentence. */
  expect: string;
  /** The calls to make, in order, for these capabilities. */
  calls(caps: PluginCaps | null): RawCall[];
  /** Whether the outcomes match the expectation; `check` means look at the log. */
  verdict(outcomes: Outcome[]): Verdict;
}

const play = (effect: Record<string, unknown>, extra: Record<string, unknown> = {}): RawCall => ({
  cmd: 'plugin:haptics|play',
  args: { req: { effect }, ...extra },
});

const steps = (list: { atMs: number; effect: Record<string, unknown> }[]): RawCall => ({
  cmd: 'plugin:haptics|play_steps',
  args: { steps: list.map((s) => ({ atMs: s.atMs, request: { effect: s.effect } })) },
});

const maxMs = (caps: PluginCaps | null): number => caps?.limits?.maxDurationMs ?? 10000;
const reasonOf = (o: Outcome | undefined): string => o?.result?.reason ?? '';
const yes = (b: boolean): Verdict => (b ? 'ok' : 'check');

/** The first predefined effect the device does not report as supported, else the first it is unsure of, else `heavy_click`. */
export function unsupportedEffect(caps: PluginCaps | null): { id: string; found: boolean } {
  const effects = caps?.effects ?? {};
  for (const want of ['no', 'unknown']) {
    const hit = Object.entries(effects).find(([, v]) => v === want);
    if (hit) return { id: hit[0], found: true };
  }
  return { id: 'heavy_click', found: false };
}

/** The first primitive the motor lacks, else `slow_rise` (which the motor may have). */
export function missingPrimitive(caps: PluginCaps | null): { id: string; found: boolean } {
  for (const id of ['spin', 'slow_rise', 'quick_rise', 'low_tick', 'tick', 'thud']) {
    if (caps?.primitives?.[id as 'tick']?.supported === false) return { id, found: true };
  }
  return { id: 'slow_rise', found: false };
}

/** A short valid envelope within the device's limits (a default shape when the limits are unknown). */
export function validEnvelope(caps: PluginCaps | null): Record<string, unknown> {
  const info = caps?.envelopeInfo;
  const d = Math.min(
    info?.maxControlPointDurationMs ?? 40,
    Math.max(info?.minControlPointDurationMs ?? 10, 40),
  );
  const hz = info?.frequencyProfile
    ? Math.round((info.frequencyProfile.minHz + info.frequencyProfile.maxHz) / 2)
    : (caps?.resonantHz ?? 150);
  return {
    type: 'envelopeWaveform',
    ...(info?.frequencyProfile ? { initialFrequencyHz: hz } : {}),
    controlPoints: [
      { amplitude: 0.3, frequencyHz: hz, durationMs: d },
      { amplitude: 0.8, frequencyHz: hz, durationMs: d },
      { amplitude: 0.5, frequencyHz: hz, durationMs: d },
      { amplitude: 0, frequencyHz: hz, durationMs: d },
    ],
  };
}

/** An envelope that runs past the device's duration limit, so the plugin must refuse it. */
export function longEnvelope(caps: PluginCaps | null): Record<string, unknown> {
  const info = caps?.envelopeInfo;
  const limit = Math.min(info?.maxDurationMs ?? maxMs(caps), maxMs(caps));
  const d = info?.maxControlPointDurationMs ?? 100;
  const hz = info?.frequencyProfile?.minHz ?? caps?.resonantHz ?? 150;
  const n = Math.ceil((limit + 200) / d);
  return {
    type: 'envelopeWaveform',
    controlPoints: Array.from({ length: n }, () => ({
      amplitude: 0.2,
      frequencyHz: hz,
      durationMs: d,
    })),
  };
}

export const SMOKE_CASES: readonly SmokeCase[] = [
  {
    id: 1,
    title: 'One-shot over the limit',
    expect:
      'Plays maxDurationMs (10 s by default) and says "Truncated to 10000 ms". Tap Stop to cut it short.',
    calls: (c) => [play({ type: 'oneshot', durationMs: maxMs(c) + 2000, amplitude: 80 })],
    verdict: (o) => yes(/truncat/i.test(reasonOf(o[0]))),
  },
  {
    id: 2,
    title: 'Repeating waveform',
    expect:
      'Plays once; the reason says the repeat was ignored (allowRepeatingWaveforms is false).',
    calls: () => [
      play({
        type: 'waveform',
        timingsMs: [0, 60, 60, 60],
        amplitudes: [0, 200, 0, 200],
        repeat: 0,
      }),
    ],
    verdict: (o) => yes(/repeat/i.test(reasonOf(o[0]))),
  },
  {
    id: 3,
    title: 'Steps cut each other',
    expect:
      'A 100 ms one-shot at 0 and a 10 ms one-shot at 50: the second cuts the first, estimatedMs about 60.',
    calls: () => [
      steps([
        { atMs: 0, effect: { type: 'oneshot', durationMs: 100, amplitude: 200 } },
        { atMs: 50, effect: { type: 'oneshot', durationMs: 10, amplitude: 255 } },
      ]),
    ],
    verdict: (o) =>
      yes((o[0]?.result?.estimatedMs ?? 0) >= 50 && (o[0]?.result?.estimatedMs ?? 0) <= 75),
  },
  {
    id: 4,
    title: 'Step near the limit',
    expect:
      'Adapted to the default limit: a 100 ms one-shot 50 ms before maxDurationMs plays about 50 ms, with a truncation reason. (The plan used maxDurationMs 100 and atMs 90; set that in tauri.conf.json to run it as written.) Takes 10 s to play out.',
    calls: (c) => [
      steps([
        { atMs: maxMs(c) - 50, effect: { type: 'oneshot', durationMs: 100, amplitude: 200 } },
      ]),
    ],
    verdict: (o) => yes(/truncat/i.test(reasonOf(o[0]))),
  },
  {
    id: 5,
    title: 'Unsupported predefined effect',
    expect:
      'Plays anyway at tier 1, downgraded, with a reason. Uses the first effect that capabilities() does not report as supported.',
    calls: (c) => [play({ type: 'predefined', effectId: unsupportedEffect(c).id })],
    verdict: (o) => yes(o[0]?.result?.tier === 1 && o[0]?.result?.downgraded === true),
  },
  {
    id: 6,
    title: 'Missing primitive',
    expect:
      'A composition with a primitive the motor lacks substitutes a neighbour or drops it, with a reason.',
    calls: (c) => [
      play({
        type: 'composition',
        steps: [
          { kind: 'primitive', primitive: 'click', scale: 0.8 },
          { kind: 'primitive', primitive: missingPrimitive(c).id, scale: 0.8, delayMs: 40 },
          { kind: 'primitive', primitive: 'click', scale: 0.8, delayMs: 40 },
        ],
      }),
    ],
    verdict: (o) => yes(reasonOf(o[0]).length > 0),
  },
  {
    id: 7,
    title: 'Envelope and an over-long envelope',
    expect:
      'The first plays on API 36 and up (tier 4, or a reasoned fallback elsewhere); the second, past the limit, rejects.',
    calls: (c) => [play(validEnvelope(c)), play(longEnvelope(c))],
    verdict: (o) => yes(o[0]?.result !== undefined && o[1]?.error !== undefined),
  },
  {
    id: 8,
    title: 'Empty envelope',
    expect: 'Empty controlPoints reject INVALID_EFFECT with scale 0 and again with maxTier 1.',
    calls: () => [
      play({ type: 'envelopeWaveform', controlPoints: [] }, { scale: 0 }),
      play({ type: 'envelopeWaveform', controlPoints: [] }, { maxTier: 1 }),
    ],
    verdict: (o) => yes(o.length === 2 && o.every((x) => /INVALID_EFFECT/i.test(x.error ?? ''))),
  },
];

/** What the user agent says about the phone: Android release, model and Chrome (WebView) version. */
export function readUserAgent(ua: string): { android?: string; model?: string; webview?: string } {
  const a = /Android ([\d.]+)(?:; ([^;)]+))?/.exec(ua);
  const c = /(?:Chrome|Version)\/([\d.]+)/.exec(ua);
  return {
    ...(a?.[1] ? { android: a[1] } : {}),
    ...(a?.[2] ? { model: a[2].trim() } : {}),
    ...(c?.[1] ? { webview: c[1] } : {}),
  };
}
