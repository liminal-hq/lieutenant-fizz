// Tests for the haptics page's smoke cases and user-agent reader.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { PluginCaps } from '@lieutenant-fizz/engine/haptic-plugin';
import {
  SMOKE_CASES,
  longEnvelope,
  missingPrimitive,
  readEngine,
  readUserAgent,
  unsupportedEffect,
  validEnvelope,
} from './haptics-cases';

const caps: PluginCaps = {
  hasVibrator: true,
  hasAmplitudeControl: true,
  topTier: 3,
  compositionSupported: true,
  primitives: {
    click: { supported: true, durationMs: 15 },
    spin: { supported: false, durationMs: null },
  },
  effects: { click: 'yes', tick: 'no', heavy_click: 'unknown' },
  envelopeSupported: true,
  envelopeInfo: {
    maxSize: 16,
    minControlPointDurationMs: 10,
    maxControlPointDurationMs: 100,
    maxDurationMs: 1000,
    frequencyProfile: { minHz: 50, maxHz: 250 },
  },
  limits: { maxDurationMs: 10000, maxAmplitude: 255, allowRepeatingWaveforms: false },
};

const calls = (id: number, c: PluginCaps | null = caps) =>
  SMOKE_CASES.find((x) => x.id === id)?.calls(c) ?? [];

describe('smoke cases', () => {
  it('has the eight raw cases in order', () => {
    expect(SMOKE_CASES.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('builds case 1 past the limit and case 2 with a repeat', () => {
    expect(calls(1)[0]?.args).toMatchObject({
      req: { effect: { type: 'oneshot', durationMs: 12000 } },
    });
    expect(calls(2)[0]?.args).toMatchObject({ req: { effect: { type: 'waveform', repeat: 0 } } });
  });

  it('builds the step cases', () => {
    expect(calls(3)[0]?.cmd).toBe('plugin:haptics|play_steps');
    expect(calls(3)[0]?.args).toMatchObject({ steps: [{ atMs: 0 }, { atMs: 50 }] });
    expect(calls(4)[0]?.args).toMatchObject({ steps: [{ atMs: 9950 }] });
  });

  it('picks an unsupported effect and a missing primitive, with a fallback', () => {
    expect(unsupportedEffect(caps)).toEqual({ id: 'tick', found: true });
    expect(unsupportedEffect(null)).toEqual({ id: 'heavy_click', found: false });
    expect(missingPrimitive(caps)).toEqual({ id: 'spin', found: true });
    expect(missingPrimitive(null).found).toBe(false);
  });

  it('keeps the valid envelope in the limits and the long one over them', () => {
    const ok = validEnvelope(caps) as {
      controlPoints: { durationMs: number; frequencyHz: number }[];
    };
    expect(ok.controlPoints.every((p) => p.durationMs >= 10 && p.durationMs <= 100)).toBe(true);
    expect(ok.controlPoints[0]?.frequencyHz).toBe(150);
    const long = longEnvelope(caps) as { controlPoints: { durationMs: number }[] };
    expect(long.controlPoints.reduce((a, p) => a + p.durationMs, 0)).toBeGreaterThan(1000);
  });

  it('sends the empty envelope with scale 0 and then maxTier 1', () => {
    expect(calls(8).map((c) => c.args)).toEqual([
      { req: { effect: { type: 'envelopeWaveform', controlPoints: [] } }, scale: 0 },
      { req: { effect: { type: 'envelopeWaveform', controlPoints: [] } }, maxTier: 1 },
    ]);
  });

  it('judges outcomes', () => {
    const [c1, c8] = [SMOKE_CASES[0], SMOKE_CASES[7]];
    const call = { cmd: 'x' };
    const res = (reason: string) => ({
      ok: true,
      tier: 1 as const,
      estimatedMs: 1,
      downgraded: true,
      reason,
    });
    expect(c1?.verdict([{ call, result: res('Truncated to 10000 ms') }])).toBe('ok');
    expect(c1?.verdict([{ call, result: res('') }])).toBe('check');
    expect(
      c8?.verdict([
        { call, error: 'INVALID_EFFECT: empty' },
        { call, error: 'INVALID_EFFECT' },
      ]),
    ).toBe('ok');
    expect(
      c8?.verdict([
        { call, error: 'invalid request: controlPoints cannot be empty' },
        { call, error: 'invalid request: controlPoints cannot be empty' },
      ]),
    ).toBe('ok');
    expect(
      c8?.verdict([
        { call, error: 'INVALID_EFFECT' },
        { call, result: res('') },
      ]),
    ).toBe('check');
  });
});

describe('readEngine', () => {
  it('names the Android WebView, WebKitGTK and a Chromium browser', () => {
    expect(
      readEngine(
        'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro Build/CP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.8010.36 Mobile Safari/537.36',
      ),
    ).toEqual({ name: 'WebView', version: '153.0.8010.36' });
    expect(
      readEngine(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.1',
      ),
    ).toEqual({ name: 'WebKitGTK', version: '605.1.15' });
    expect(
      readEngine(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toEqual({ name: 'Chromium', version: '130.0.0.0' });
    expect(readEngine('curl/8')).toEqual({ name: 'engine' });
  });
});

describe('readUserAgent', () => {
  it('reads the Android release, model and WebView', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro Build/CP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
    expect(readUserAgent(ua)).toEqual({
      android: '17',
      model: 'Pixel 8 Pro Build/CP1A',
      webview: '153.0.0.0',
    });
    expect(readUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toEqual({});
  });
});
