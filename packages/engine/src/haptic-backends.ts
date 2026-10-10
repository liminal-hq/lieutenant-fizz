// Haptic backends: none, `navigator.vibrate` and a recording fake for tests.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  RUMBLE_COMPILE,
  VIBRATE_COMPILE,
  compileRumble,
  compileVibrate,
  totalTime,
  type HapticPattern,
  type RumbleBoost,
  type RumbleCompile,
  type RumblePlain,
  type RumbleSegment,
  type VibrateCompile,
} from './haptic-pattern';
import type { PluginCompile } from './haptic-plugin-compile';

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
  /** What was sent to the platform: on and off times for a vibrator, segments for a controller. */
  compiled?: number[] | RumbleSegment[];
  /** How long the effect runs, in ms; `GameHaptics` treats the backend as busy for this long. */
  ms: number;
}

/** What a backend may know about the cue it plays, beyond the pattern. */
export interface PlayContext {
  /** The cue is a menu cue; `master` is the strength setting, 0 to 1, without the menu boost. */
  ui?: { master: number };
}

export interface HapticBackend {
  caps(): HapticCaps;
  /**
   * Plays a pattern, replacing whatever runs. `scale` is the cue's strength times the master. `ctx.ui` is
   * set for a menu cue, with the master strength (0 to 1) it was scaled by. Never throws.
   */
  play(p: HapticPattern, scale: number, ctx?: PlayContext): PlayResult;
  /** Stops whatever runs. Never throws. */
  stop(): void;
  /** Changes the compiler constants while running (the lab and the console); absent where nothing compiles. */
  tune?(patch: Partial<VibrateCompile>): void;
  /** Changes the rumble compiler constants while running; absent where nothing rumbles. */
  tuneRumble?(patch: Partial<RumbleCompile>): void;
  /** Changes the plain rumble profile's constants while running; absent where nothing lengthens. */
  tunePlain?(patch: Partial<RumblePlain>): void;
  /** Which rumble profile plays on the pad in use now, or absent when the backend has none. */
  rumbleProfile?(): 'boost' | 'plain' | null;
  /** Changes the pad rumble boost's constants while running; absent where nothing boosts (the web's `vibrationActuator`). */
  tuneBoost?(patch: Partial<RumbleBoost>): void;
  /** Changes the plugin compiler's constants, for the Tauri plugin backend. */
  tunePlugin?(patch: Partial<PluginCompile>): void;
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
  compileFrom: Readonly<VibrateCompile> = VIBRATE_COMPILE,
): HapticBackend {
  const compile: VibrateCompile = { ...compileFrom };
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
    tune(patch) {
      Object.assign(compile, patch);
    },
    dispose() {
      this.stop();
    },
  };
}

/** The slice of a `Gamepad.vibrationActuator` the rumble backend uses. */
export interface RumbleActuator {
  playEffect?: (
    type: 'dual-rumble',
    params: {
      startDelay: number;
      duration: number;
      strongMagnitude: number;
      weakMagnitude: number;
    },
  ) => Promise<unknown> | unknown;
  reset?: () => Promise<unknown> | unknown;
}

export interface RumblePad {
  id?: string;
  vibrationActuator?: RumbleActuator | null;
}

/** Timers the rumble backend schedules its segments with; tests pass a fake clock. */
export interface RumbleTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: RumbleTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Controller rumble through `Gamepad.vibrationActuator`. Each `playEffect` replaces the running one, so a
 * pattern is a list of steady segments, each fired by a timer at its start; a new play, `stop()` or a
 * hidden page cancels the timers that have not fired. Rejections (the page hidden, an unplugged pad) are
 * swallowed. `getPad` returns the pad the player is using, or null.
 */
export function gamepadBackend(
  getPad: () => RumblePad | null,
  opts: { timers?: RumbleTimers; compile?: Readonly<RumbleCompile> } = {},
): HapticBackend {
  const timers = opts.timers ?? realTimers;
  const compile: RumbleCompile = { ...(opts.compile ?? RUMBLE_COMPILE) };
  let handles: unknown[] = [];
  let used: RumbleActuator | null = null;
  const actuator = (): RumbleActuator | null => {
    const a = getPad()?.vibrationActuator;
    return a && typeof a.playEffect === 'function' ? a : null;
  };
  const cancel = (): void => {
    for (const h of handles) timers.clear(h);
    handles = [];
  };
  const swallow = (r: unknown): void => {
    if (r && typeof (r as Promise<unknown>).catch === 'function')
      (r as Promise<unknown>).catch(() => {});
  };
  const caps = (): HapticCaps => {
    const pad = getPad();
    return actuator()
      ? {
          id: 'gamepad',
          available: true,
          tier: 2,
          target: 'controller',
          ...(pad?.id ? { name: pad.id } : {}),
        }
      : {
          id: 'gamepad',
          available: false,
          reason: pad ? 'this controller cannot rumble' : 'no controller',
          tier: 0,
          target: 'controller',
        };
  };
  const fail = (reason: string): PlayResult => ({
    ok: false,
    tier: 0,
    downgraded: false,
    target: 'controller',
    reason,
    ms: 0,
  });
  const fire = (a: RumbleActuator, seg: RumbleSegment): void => {
    try {
      swallow(
        a.playEffect?.('dual-rumble', {
          startDelay: 0,
          duration: seg.duration,
          strongMagnitude: seg.strong,
          weakMagnitude: seg.weak,
        }),
      );
    } catch {
      /* a pad that throws is as good as no pad */
    }
  };
  return {
    caps,
    play(p, scale) {
      const a = actuator();
      if (!a) return fail(caps().reason ?? 'no controller');
      cancel();
      const compiled = compileRumble(p, scale, compile);
      if (compiled.length === 0)
        return { ok: true, tier: 2, downgraded: false, target: 'controller', compiled, ms: 0 };
      used = a;
      for (const seg of compiled) {
        if (seg.at <= 0) fire(a, seg);
        else handles.push(timers.set(() => fire(a, seg), seg.at));
      }
      const last = compiled[compiled.length - 1] as RumbleSegment;
      return {
        ok: true,
        tier: 2,
        downgraded: false,
        target: 'controller',
        compiled,
        ms: last.at + last.duration,
      };
    },
    stop() {
      cancel();
      const a = used;
      used = null;
      if (!a) return;
      try {
        swallow(a.reset?.());
      } catch {
        /* nothing to stop */
      }
    },
    tuneRumble(patch) {
      Object.assign(compile, patch);
    },
    dispose() {
      this.stop();
    },
  };
}

/** A backend that records what it is asked to play, for tests and the lab. */
export interface FakeBackend extends HapticBackend {
  readonly plays: { pattern: HapticPattern; scale: number; compiled: number[] }[];
  /** The compiler patches it was given. */
  readonly tuned: Partial<VibrateCompile>[];
  /** The rumble compiler patches it was given. */
  readonly tunedRumble: Partial<RumbleCompile>[];
  /** The rumble boost patches it was given. */
  readonly tunedBoost: Partial<RumbleBoost>[];
  /** The plain rumble patches it was given. */
  readonly tunedPlain: Partial<RumblePlain>[];
  /** The plugin compiler patches it was given. */
  readonly tunedPlugin: Partial<PluginCompile>[];
  stops: number;
}

export function fakeBackend(
  opts: { available?: boolean; tier?: 0 | 1 | 2 | 3 | 4; target?: HapticCaps['target'] } = {},
): FakeBackend {
  const available = opts.available ?? true;
  const target = opts.target ?? 'device';
  const plays: FakeBackend['plays'] = [];
  const compile: VibrateCompile = { ...VIBRATE_COMPILE };
  const b: FakeBackend = {
    plays,
    tuned: [],
    tunedRumble: [],
    tunedBoost: [],
    tunedPlain: [],
    tunedPlugin: [],
    stops: 0,
    caps: () => ({
      id: 'fake',
      available,
      tier: available ? (opts.tier ?? 1) : 0,
      target,
      ...(available ? {} : { reason: 'fake is unavailable' }),
    }),
    play(pattern, scale) {
      if (!available)
        return {
          ok: false,
          tier: 0,
          downgraded: false,
          target,
          reason: 'unavailable',
          ms: 0,
        };
      const compiled = compileVibrate(pattern, scale, compile);
      plays.push({ pattern, scale, compiled });
      return {
        ok: true,
        tier: 1,
        downgraded: true,
        target,
        compiled,
        ms: totalTime(compiled),
      };
    },
    stop() {
      b.stops++;
    },
    tune(patch) {
      Object.assign(compile, patch);
      b.tuned.push(patch);
    },
    tuneRumble(patch) {
      b.tunedRumble.push(patch);
    },
    tuneBoost(patch) {
      b.tunedBoost.push(patch);
    },
    tunePlain(patch) {
      b.tunedPlain.push(patch);
    },
    rumbleProfile: () => 'boost',
    tunePlugin(patch) {
      b.tunedPlugin.push(patch);
    },
    dispose() {},
  };
  return b;
}
