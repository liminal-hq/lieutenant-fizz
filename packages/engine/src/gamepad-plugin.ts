// Haptic backend for the Tauri gamepad-haptics plugin: plays the controller cues on a pad the plugin can address, and leaves the webview's Gamepad API to every pad it cannot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  RUMBLE_BOOST,
  RUMBLE_COMPILE,
  compileBoostedRumble,
  compileMenuRumble,
  compilePlainRumble,
  RUMBLE_PLAIN,
  type RumblePlain,
  compileRumble,
  type HapticPattern,
  type RumbleBoost,
  type RumbleCompile,
  type RumbleSegment,
} from './haptic-pattern';
import type {
  HapticBackend,
  HapticCaps,
  PlayContext,
  PlayResult,
  RumblePad,
} from './haptic-backends';
import { tauriInvoke, type Invoke } from './haptic-plugin';
import { parseGamepadId } from './pad-model';

// ---------- The plugin's shapes (camelCase on the wire) ----------

/** A pad the plugin can address, as `list_pads` reports it. `topTier` is 0 for a pad that cannot play. */
export interface NativePad {
  id: string;
  slot: number;
  name: string;
  vendorId: number;
  productId: number;
  serial?: string;
  guid?: string;
  /** `usb`, `bluetooth` or `unknown`. */
  transport?: string;
  topTier: number;
  /** The light motor only switches on and off (a DualShock 3): the plugin pulses it to approximate a level. */
  lightBinary?: boolean;
  reason?: string;
}

/** Motor levels, 0 to 1, held for `durationMs`: the plugin's `Frame`. `heavy` is the low-frequency motor. */
export interface MotorFrame {
  durationMs: number;
  heavy: number;
  light: number;
}

/** What the plugin answers to a play. */
export interface NativePlayResult {
  ok?: boolean;
  tier: number;
  target?: string;
  downgraded?: boolean;
  reason?: string;
}

/**
 * The plugin's commands and pad events, in the shapes this module needs. `pluginPadApi` is the real one
 * (raw IPC, no guest package); tests pass a fake.
 */
export interface PadApi {
  listPads(): Promise<NativePad[]>;
  playFrames(padId: string, frames: MotorFrame[]): Promise<NativePlayResult>;
  identify(padId: string): Promise<NativePlayResult>;
  /** Stops one pad, or every pad when `padId` is omitted. */
  stop(padId?: string): Promise<void>;
  /** Calls `fn` when a pad connects, changes or disconnects. Resolves with the unsubscribe. */
  onPads(fn: () => void): Promise<() => void>;
}

/** The plugin's events (`gamepad-haptics://…`), one per pad change. */
export const PAD_EVENTS = [
  'gamepad-haptics://connected',
  'gamepad-haptics://changed',
  'gamepad-haptics://disconnected',
] as const;

/** Subscribes to a Tauri event; `@tauri-apps/api/event` is loaded when first needed, so the web bundle never has it. */
export type Listen = (event: string, fn: () => void) => Promise<() => void>;

const tauriListen: Listen = async (event, fn) => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(event, () => fn());
};

const PREFIX = 'plugin:gamepad-haptics|';

/**
 * The plugin through raw IPC, like the phone plugin's backend. The guest package
 * (`@liminal-hq/plugin-gamepad-haptics`) is built from a subfolder of a monorepo, which a git
 * dependency cannot install, so the commands are called by name.
 */
export function pluginPadApi(opts: { invoke?: Invoke; listen?: Listen } = {}): PadApi {
  const invoke = opts.invoke ?? tauriInvoke;
  const listen = opts.listen ?? tauriListen;
  return {
    listPads: () => invoke(`${PREFIX}list_pads`) as Promise<NativePad[]>,
    playFrames: (padId, frames) =>
      invoke(`${PREFIX}play_frames`, { args: { padId, frames } }) as Promise<NativePlayResult>,
    identify: (padId) => invoke(`${PREFIX}identify`, { padId }) as Promise<NativePlayResult>,
    stop: async (padId) => {
      await invoke(`${PREFIX}stop`, padId === undefined ? {} : { padId });
    },
    async onPads(fn) {
      const offs = await Promise.all(PAD_EVENTS.map((e) => listen(e, fn)));
      return () => {
        for (const off of offs) off();
      };
    },
  };
}

// ---------- Choosing a pad ----------

/**
 * Whether a pad needs the rumble boost: its heavy motor has a dead zone and its light motor is on or off.
 * A DualShock 3 (`hid-sony`, 054c:0268) is the one known case; a DualShock 4's two motors are variable and
 * respond at low strengths, so it plays the plain compile.
 * TODO: have the plugin say which pads have an on/off light motor, instead of listing the family here.
 */
export function isOnOffLightPad(pad: Pick<NativePad, 'vendorId' | 'productId'>): boolean {
  return pad.vendorId === 0x054c && pad.productId === 0x0268;
}

const plain = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** A name without its punctuation, case or "Sony " prefix. */
const bare = (s: string): string => plain(s).replace(/^sony /, '');

/** The native pads that fit a Web `Gamepad`, by vendor and product, else by name. May be several (two of one model). */
export function matchPads(pads: readonly NativePad[], web: { id: string }): NativePad[] {
  const ids = parseGamepadId(web.id);
  if (ids) return pads.filter((p) => p.vendorId === ids.vendorId && p.productId === ids.productId);
  // Names differ between the webview and the kernel ("Sony PLAYSTATION(R)3 Controller" on USB, "PLAYSTATION(R)3
  // Controller" over Bluetooth), so an equal name wins, and a name that contains the other is the fallback.
  const name = bare(web.id);
  const named = pads.filter((p) => bare(p.name) === name && name.length > 0);
  if (named.length > 0) return named;
  return pads.filter((p) => {
    const n = bare(p.name);
    return n.length > 0 && (name.includes(n) || n.includes(name));
  });
}

/** What choosing found: the native pad to play, or none (then the webview's pad plays, if it can). */
export type PadChoice = { kind: 'native'; pad: NativePad } | { kind: 'web' } | { kind: 'none' };

/**
 * Which pad a cue plays on. The plugin's rule is one writer per pad: a pad it can address is played
 * natively, and only a pad it cannot (one it does not list, or lists without write access) is left to the
 * webview.
 *
 * - The pad the player used last (`web`, the Gamepad the game reads) decides when there is one: its native
 *   twin plays it, and when none fits it is the webview's to play. Two identical pads match equally; the
 *   one in the lower slot plays.
 * - With no such pad (the webview lists one only after a button is pressed), the first native pad that
 *   can play.
 */
export function choosePad(pads: readonly NativePad[], web: { id: string } | null): PadChoice {
  const playable = pads.filter((p) => p.topTier > 0);
  if (web) {
    const fit = matchPads(playable, web).sort((a, b) => a.slot - b.slot)[0];
    if (fit) return { kind: 'native', pad: fit };
    // A pad the plugin lists but cannot play (no write access) is still the webview's to try: it never
    // writes the same pad, and the web backend reports unavailable when its Gamepad has no actuator.
    return { kind: 'web' };
  }
  const first = [...playable].sort((a, b) => a.slot - b.slot)[0];
  return first ? { kind: 'native', pad: first } : { kind: 'none' };
}

// ---------- Compiling ----------

/**
 * The rumble segments of a cue as the plugin's frames: each segment's strong motor is the heavy one and its
 * weak motor the light one, with a silent frame in each gap. Whole milliseconds, as the plugin requires.
 */
export function framesOf(segments: readonly RumbleSegment[]): MotorFrame[] {
  const frames: MotorFrame[] = [];
  let at = 0;
  for (const seg of segments) {
    const start = Math.max(at, Math.round(seg.at));
    if (start > at) frames.push({ durationMs: start - at, heavy: 0, light: 0 });
    const duration = Math.max(1, Math.round(seg.duration));
    frames.push({
      durationMs: duration,
      heavy: Math.min(1, Math.max(0, seg.strong)),
      light: Math.min(1, Math.max(0, seg.weak)),
    });
    at = start + duration;
  }
  return frames;
}

// ---------- Backend ----------

/** The controller backend with what the page and the game need beyond `HapticBackend`. */
export interface GamepadPluginBackend extends HapticBackend {
  /** Resolves once the plugin's pads are first read (an empty list if reading failed). */
  readonly ready: Promise<NativePad[]>;
  /** The pads the plugin sees right now. */
  pads(): readonly NativePad[];
  /** The pad that would play now, by the same choice a cue makes. */
  choice(): PadChoice;
  /** Calls `fn` with the pads each time one connects, changes or disconnects. Returns an unsubscribe. */
  onPads(fn: (pads: readonly NativePad[]) => void): () => void;
  /** Buzzes a pad so the player can tell which it is. */
  identify(padId: string): Promise<NativePlayResult>;
  /** Re-reads the pads. */
  refresh(): Promise<NativePad[]>;
}

/** A pad for people: its name, how it is connected and the plugin's id for it. */
export function padLabel(pad: Pick<NativePad, 'id' | 'name' | 'transport'>): string {
  const how = pad.transport && pad.transport !== 'unknown' ? `, ${pad.transport}` : '';
  return `${pad.name}${how} (${pad.id})`;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The controller's rumble through the gamepad-haptics plugin, with the webview's pad as the fallback.
 *
 * Each cue compiles to dual-rumble segments (`compileRumble`, the same as the web backend) and plays as
 * motor frames on the chosen pad. The pads are read at creation and again on each pad event; until then, and
 * whenever the plugin has no pad that fits, a cue goes to `fallback` (the webview's `gamepadBackend`) instead.
 * A pad found natively is never also played through the Gamepad API: `play` picks one writer per cue and
 * stops the other. `getWebPad` is the pad the game reads (the one that last had input). Nothing here throws
 * or rejects.
 */
export function gamepadPluginBackend(
  fallback: HapticBackend,
  getWebPad: () => RumblePad | null,
  opts: {
    api?: PadApi;
    compile?: Readonly<RumbleCompile>;
    boost?: Readonly<RumbleBoost>;
    plain?: Readonly<RumblePlain>;
    /** `false` plays the compiled segments as they are on every pad (for a pad with real dual rumble). */
    useBoost?: boolean;
  } = {},
): GamepadPluginBackend {
  const api = opts.api ?? pluginPadApi();
  const compile: RumbleCompile = { ...(opts.compile ?? RUMBLE_COMPILE) };
  const boost: RumbleBoost = { ...(opts.boost ?? RUMBLE_BOOST) };
  const plain: RumblePlain = { ...(opts.plain ?? RUMBLE_PLAIN) };
  const useBoost = opts.useBoost ?? true;
  let pads: NativePad[] = [];
  let off: (() => void) | null = null;
  let disposed = false;
  let nativePlaying: string | null = null;
  let webPlaying = false;
  const listeners = new Set<(p: readonly NativePad[]) => void>();

  const refresh = async (): Promise<NativePad[]> => {
    try {
      pads = await api.listPads();
    } catch {
      pads = [];
    }
    if (nativePlaying !== null && !pads.some((p) => p.id === nativePlaying)) nativePlaying = null;
    for (const fn of [...listeners]) {
      try {
        fn(pads);
      } catch {
        /* a listener that throws is not the backend's problem */
      }
    }
    return pads;
  };

  const ready = refresh();
  void api
    .onPads(() => void refresh())
    .then(
      (unlisten) => {
        if (disposed) unlisten();
        else off = unlisten;
      },
      () => {},
    );

  const webChoice = (): { id: string } | null => {
    const pad = getWebPad();
    return pad ? { id: pad.id ?? '' } : null;
  };
  const choice = (): PadChoice => choosePad(pads, webChoice());

  const fail = (reason: string): PlayResult => ({
    ok: false,
    tier: 0,
    downgraded: false,
    target: 'controller',
    reason,
    ms: 0,
  });

  const swallow = (p: Promise<unknown>): void => {
    p.catch(() => {});
  };

  const stopNative = (): void => {
    const id = nativePlaying;
    nativePlaying = null;
    if (id !== null) swallow(api.stop(id));
  };

  return {
    ready,
    pads: () => pads,
    choice,
    refresh,
    onPads(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    identify: async (padId) => {
      try {
        return await api.identify(padId);
      } catch (e) {
        return { ok: false, tier: 0, reason: message(e) };
      }
    },
    caps(): HapticCaps {
      const c = choice();
      if (c.kind === 'native') {
        return {
          id: 'gamepad',
          available: true,
          tier: c.pad.topTier >= 2 ? 2 : 1,
          target: 'controller',
          name: padLabel(c.pad),
        };
      }
      if (c.kind === 'web') {
        const web = fallback.caps();
        // Where the webview cannot play either, say why the plugin could not (no write access), not only that
        // the webview has no actuator.
        const unplayable = pads.find((p) => p.topTier === 0 && p.reason);
        return web.available || !unplayable ? web : { ...web, reason: unplayable.reason };
      }
      const unplayable = pads[0];
      return {
        id: 'gamepad',
        available: false,
        reason: unplayable?.reason ?? 'no controller',
        tier: 0,
        target: 'controller',
      };
    },
    play(p: HapticPattern, scale: number, ctx?: PlayContext): PlayResult {
      const c = choice();
      if (c.kind === 'web') {
        // The cue moves to the webview's pad: a native pad still rumbling stops first.
        stopNative();
        webPlaying = true;
        return fallback.play(p, scale);
      }
      if (c.kind === 'none') {
        // No pad can play natively. The webview's pad has no better chance, so stay quiet.
        return fail(pads[0]?.reason ?? 'no controller');
      }
      // One writer per pad: whatever the webview's pad was playing stops before the native pad starts.
      if (webPlaying) {
        webPlaying = false;
        fallback.stop();
      }
      // The same holds across native pads: a cue moving to another pad stops the one still rumbling.
      if (nativePlaying !== c.pad.id) stopNative();
      const boosted = useBoost && isOnOffLightPad(c.pad);
      const compiled = boosted
        ? ctx?.ui
          ? compileMenuRumble(p, ctx.ui.master, compile, boost)
          : compileBoostedRumble(p, scale, compile, boost)
        : useBoost
          ? compilePlainRumble(p, scale, compile, plain)
          : compileRumble(p, scale, compile);
      const tier = c.pad.topTier >= 2 ? 2 : 1;
      const frames = framesOf(compiled);
      if (frames.length === 0)
        return { ok: true, tier, downgraded: false, target: 'controller', compiled, ms: 0 };
      nativePlaying = c.pad.id;
      swallow(api.playFrames(c.pad.id, frames));
      const last = compiled[compiled.length - 1] as RumbleSegment;
      return {
        ok: true,
        tier,
        downgraded: tier < 2,
        target: 'controller',
        compiled,
        ms: last.at + last.duration,
      };
    },
    stop() {
      if (webPlaying) {
        webPlaying = false;
        fallback.stop();
      }
      stopNative();
    },
    tuneRumble(patch) {
      Object.assign(compile, patch);
      fallback.tuneRumble?.(patch);
    },
    tuneBoost(patch) {
      Object.assign(boost, patch);
    },
    tunePlain(patch) {
      Object.assign(plain, patch);
    },
    rumbleProfile() {
      const c = choice();
      if (c.kind !== 'native' || !useBoost) return null;
      return isOnOffLightPad(c.pad) ? 'boost' : 'plain';
    },
    dispose() {
      this.stop();
      disposed = true;
      off?.();
      off = null;
      listeners.clear();
      fallback.dispose();
    },
  };
}

/** The part of `GameHaptics` that `adoptGamepadPlugin` uses. */
export interface ControllerBackendHost {
  setBackends(b: { controller?: HapticBackend }): void;
}

/**
 * Makes the plugin the controller's backend when the page runs in the desktop app. The web `fallback` stays
 * inside it for any pad the plugin cannot reach, and plays for every pad when the plugin has none (or is
 * missing or denied), so adopting costs nothing where the plugin does nothing. Resolves with the backend, or
 * null outside the desktop app. Never rejects.
 */
export function adoptGamepadPlugin(
  host: ControllerBackendHost,
  fallback: HapticBackend,
  getWebPad: () => RumblePad | null,
  inDesktopApp: boolean,
  opts: { api?: PadApi } = {},
): GamepadPluginBackend | null {
  if (!inDesktopApp) return null;
  const backend = gamepadPluginBackend(fallback, getWebPad, opts);
  host.setBackends({ controller: backend });
  return backend;
}
