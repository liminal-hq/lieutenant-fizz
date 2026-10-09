// Haptic backends: none, `navigator.vibrate` and a recording fake for tests.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  VIBRATE_COMPILE,
  compileVibrate,
  totalTime,
  type HapticPattern,
  type VibrateCompile,
} from './haptic-pattern';

/** What a backend can do right now. `tier` is 0 (nothing), 1 (on and off) up to 4 (full envelopes). */
export interface HapticCaps {
  id: 'none' | 'vibrate' | 'gamepad' | 'plugin' | 'fake';
  available: boolean;
  reason?: string;
  tier: 0 | 1 | 2 | 3 | 4;
  target: 'device' | 'controller';
  name?: string;
}

export interface PlayResult {
  ok: boolean;
  tier: number;
  /** The backend played less than the pattern asked for (on and off instead of strength). */
  downgraded: boolean;
  target: 'device' | 'controller';
  reason?: string;
  /** What was sent to the platform. */
  compiled?: number[];
  /** How long the effect runs, in ms; `GameHaptics` treats the backend as busy for this long. */
  ms: number;
}

export interface HapticBackend {
  caps(): HapticCaps;
  /** Plays a pattern, replacing whatever runs. `scale` is the cue's strength times the master. Never throws. */
  play(p: HapticPattern, scale: number): PlayResult;
  /** Stops whatever runs. Never throws. */
  stop(): void;
  dispose(): void;
}

const NONE_CAPS: HapticCaps = {
  id: 'none',
  available: false,
  reason: 'haptics are off',
  tier: 0,
  target: 'device',
};

/** The default: every call is a quiet no-op. */
export const noneBackend: HapticBackend = {
  caps: () => NONE_CAPS,
  play: () => ({
    ok: false,
    tier: 0,
    downgraded: false,
    target: 'device',
    reason: NONE_CAPS.reason,
    ms: 0,
  }),
  stop: () => {},
  dispose: () => {},
};

/** The slice of `Navigator` the vibrate backend uses, so tests can pass a stand-in. */
export interface VibrateNavigator {
  vibrate?: unknown;
  userActivation?: { hasBeenActive: boolean };
}

/**
 * `navigator.vibrate`: on and off durations only. Detection is by type, because Firefox removed the
 * Vibration API in 129 and iOS never had it. A browser may stub it and return `false`; that, too, is
 * treated as unavailable from then on. Chrome refuses until the page has had a tap, so nothing is
 * sent before `userActivation.hasBeenActive` (a later call tries again).
 */
export function vibrateBackend(
  nav: VibrateNavigator,
  compile: Readonly<VibrateCompile> = VIBRATE_COMPILE,
): HapticBackend {
  let refused = false;
  let sent = false;
  const fn = (): ((p: number | number[]) => boolean) | null =>
    typeof nav.vibrate === 'function' ? (nav.vibrate as (p: number | number[]) => boolean) : null;
  const caps = (): HapticCaps => {
    if (!fn())
      return { id: 'vibrate', available: false, reason: 'no vibrator', tier: 0, target: 'device' };
    if (refused)
      return {
        id: 'vibrate',
        available: false,
        reason: 'the browser refused',
        tier: 0,
        target: 'device',
      };
    return { id: 'vibrate', available: true, tier: 1, target: 'device' };
  };
  const call = (arg: number | number[]): boolean | 'threw' => {
    try {
      return fn()?.call(nav, arg) ?? false;
    } catch {
      return 'threw';
    }
  };
  const fail = (reason: string): PlayResult => ({
    ok: false,
    tier: 0,
    downgraded: false,
    target: 'device',
    reason,
    ms: 0,
  });
  return {
    caps,
    play(p, scale) {
      if (!caps().available) return fail(caps().reason ?? 'unavailable');
      if (nav.userActivation && !nav.userActivation.hasBeenActive) return fail('waiting for a tap');
      const compiled = compileVibrate(p, scale, compile);
      if (compiled.length === 0) {
        return { ok: true, tier: 1, downgraded: true, target: 'device', compiled, ms: 0 };
      }
      const r = call(compiled);
      if (r !== true) {
        if (r === false) refused = true;
        return fail(r === false ? 'the browser refused' : 'vibrate threw');
      }
      sent = true;
      return {
        ok: true,
        tier: 1,
        downgraded: true,
        target: 'device',
        compiled,
        ms: totalTime(compiled),
      };
    },
    stop() {
      if (!sent) return;
      sent = false;
      call(0);
    },
    dispose() {
      this.stop();
    },
  };
}

/** A backend that records what it is asked to play, for tests and the lab. */
export interface FakeBackend extends HapticBackend {
  readonly plays: { pattern: HapticPattern; scale: number; compiled: number[] }[];
  stops: number;
}

export function fakeBackend(
  opts: { available?: boolean; tier?: 0 | 1 | 2 | 3 | 4 } = {},
): FakeBackend {
  const available = opts.available ?? true;
  const plays: FakeBackend['plays'] = [];
  const b: FakeBackend = {
    plays,
    stops: 0,
    caps: () => ({
      id: 'fake',
      available,
      tier: available ? (opts.tier ?? 1) : 0,
      target: 'device',
      ...(available ? {} : { reason: 'fake is unavailable' }),
    }),
    play(pattern, scale) {
      if (!available)
        return {
          ok: false,
          tier: 0,
          downgraded: false,
          target: 'device',
          reason: 'unavailable',
          ms: 0,
        };
      const compiled = compileVibrate(pattern, scale);
      plays.push({ pattern, scale, compiled });
      return {
        ok: true,
        tier: 1,
        downgraded: true,
        target: 'device',
        compiled,
        ms: totalTime(compiled),
      };
    },
    stop() {
      b.stops++;
    },
    dispose() {},
  };
  return b;
}
