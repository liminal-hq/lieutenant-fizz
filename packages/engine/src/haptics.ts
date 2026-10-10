// Game haptics: turns cues and captions into backend plays, one per frame, never outside a level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noneBackend, type HapticBackend, type PlayResult } from './haptic-backends';
import type { InputDevice } from './input';
import {
  COMPILE_LIMITS,
  RUMBLE_COMPILE,
  RUMBLE_LIMITS,
  VIBRATE_COMPILE,
  calmPattern,
  onTime,
  patternLength,
  readEvents,
  type HapticCue,
  type HapticPattern,
  type HapticTable,
  type Policy,
  type RumbleCompile,
  type VibrateCompile,
} from './haptic-pattern';

/** One play the backend was asked for, kept for `report()`. */
export interface PlayRecord {
  at: number;
  target: Target;
  cue: string;
  scale: number;
  ok: boolean;
  tier: number;
  reason?: string;
  compiled?: PlayResult['compiled'];
}

export interface HapticReport {
  /** What each backend can do right now. */
  caps: Record<Target, ReturnType<HapticBackend['caps']>>;
  /** Where gameplay cues go right now. */
  route: Route;
  /** The master strength of each target. */
  master: Record<Target, number>;
  /** The last plays, oldest first. */
  plays: readonly PlayRecord[];
  /** How many cues were dropped and why (`cooldown`, `busy`, `budget`, `frame`), since the start. */
  dropped: Readonly<Record<string, number>>;
  /** Vibration time spent in the last second, in ms. */
  spentMs: number;
}

/** What `tune` accepts: new events or limits for cues, compiler constants and the vibration budget. */
export interface HapticTune {
  cues?: Record<
    string,
    {
      events?: unknown;
      priority?: number;
      cooldownMs?: number;
      policy?: unknown;
      world?: boolean;
      calm?: boolean;
    }
  >;
  compile?: Partial<VibrateCompile>;
  rumble?: Partial<RumbleCompile>;
  budget?: { onMs?: number; windowMs?: number };
}

/** The two places a cue can be felt: the phone itself or a controller. */
export type Target = 'device' | 'controller';

/** Where gameplay cues go: the phone, the controller, or nowhere. Menu cues always stay on the phone. */
export type Route = Target | 'none';

/**
 * Where gameplay haptics go for the input device in use: a controller's rumble while a gamepad is
 * being played, the phone otherwise (a phone held in the hands is the touch device, and a keyboard
 * on a tablet still feels the tablet).
 */
export function routeFor(device: InputDevice): Route {
  return device === 'gamepad' ? 'controller' : 'device';
}

const KEEP = 20;
/** A queued cue waits for the running pattern only if it ends within this many ms. */
const QUEUE_WAIT = 250;
const QUEUE_MAX = 4;
/** Each repeat folded into a coalesced cue adds this much strength, up to three cues. */
const COALESCE_STEP = 0.15;
const COALESCE_MAX = 3;
/** A calm cue never plays stronger than this. */
const CALM_STRENGTH = 0.7;
/**
 * Menu cues are played through the game lane's patterns (never the OS's own view haptics, which ignore the
 * Strength setting), and at this multiple of it so a menu step is as present as a jump.
 */
export const UI_BOOST = 1.5;

/** Whether a point in the world is inside the view (with `margin` world units to spare). */
export function onScreen(
  x: number,
  y: number,
  cam: { x: number; y: number },
  halfW: number,
  halfH: number,
  margin = 0.5,
): boolean {
  return Math.abs(x - cam.x) <= halfW + margin && Math.abs(y - cam.y) <= halfH + margin;
}

interface Waiting {
  id: string;
  scale: number;
  count: number;
  order: number;
}

type Candidate = Waiting & { cue: HapticCue; queued: boolean };

const coalesceMs = (p: Policy): number => (typeof p === 'object' ? p.coalesce : 0);

/** One place a cue can play (the phone or a controller) with what is running on it. */
class Channel {
  backend: HapticBackend = noneBackend;
  /** Strength of everything played here: 0 turns it off, 1 is the pattern as written. */
  master = 1;
  busyUntil = 0;
  runPriority = 0;
  queued: Waiting[] = [];
  spent: { t: number; ms: number }[] = [];

  /** `budgeted` channels (the phone's battery) hold small cues back once they have vibrated enough. */
  constructor(readonly budgeted: boolean) {}

  stop(): void {
    this.backend.stop();
    this.busyUntil = 0;
    this.runPriority = 0;
  }
}

/**
 * The haptics runtime beside `GameAudio`. The game raises cues through `cue`, `caption` and `ui`; they
 * wait until `flush`, which the game calls once a frame, and then the strongest one plays on each
 * target. Cues in the `game` lane are dropped unless `setGameplay(true)` (a level is being played), and
 * nothing plays or keeps running while the page is hidden.
 *
 * Where: there are two targets, the phone's vibrator (`device`) and a controller's motors
 * (`controller`). `setRoute` picks where the `game` lane goes (see `routeFor`); the `ui` lane always
 * stays on the phone. Each target has its own backend, strength, running pattern and queue, and gets at
 * most one backend call a frame.
 *
 * Who plays: each cue has a priority and a policy. A cue never cuts off a higher priority that is still
 * running. `interrupt` replaces what runs, `drop-if-busy` is skipped while anything runs, `queue` waits
 * for the running pattern if it ends within 250 ms and is dropped otherwise, and `coalesce` folds the
 * repeats in a frame into one stronger pulse and ignores repeats inside its window. Between equal
 * priorities the longer pattern wins the frame. The phone's vibrator also has a budget of 400 ms on in any
 * second (checked before a cue plays, charged after, and priority 4 is never held back), which saves the
 * battery and keeps a run of small cues from becoming a hum.
 */
export class GameHaptics {
  private readonly ch: Record<Target, Channel> = {
    device: new Channel(true),
    controller: new Channel(false),
  };
  private readonly table: HapticTable;
  private route: Route = 'device';
  private gameplay = false;
  private active = true;
  private calm = false;
  private order = 0;
  private readonly pending = new Map<string, Waiting>();
  private readonly lastPlay = new Map<string, number>();
  private budget = { onMs: 400, windowMs: 1000 };
  private readonly compiler = { compile: { ...VIBRATE_COMPILE }, rumble: { ...RUMBLE_COMPILE } };
  private readonly log: PlayRecord[] = [];
  private readonly dropped: Record<string, number> = {};

  constructor(
    table: HapticTable,
    private readonly clock: { now(): number },
  ) {
    // A copy, so tuning one game's table never changes the module's.
    this.table = structuredClone(table);
  }

  /** Swaps the backends given, stopping whatever the old ones were doing. */
  setBackends(b: { device?: HapticBackend; controller?: HapticBackend }): void {
    for (const target of ['device', 'controller'] as const) {
      const next = b[target];
      if (!next) continue;
      this.ch[target].stop();
      this.ch[target].backend = next;
    }
  }

  /** Where the game lane goes. A change stops whatever is running, so a pattern never lingers on the old target. */
  setRoute(route: Route): void {
    if (route === this.route) return;
    this.route = route;
    this.stopAll();
  }

  /** The strength of each target: 0 turns it off, 1 is the pattern as written. The controller follows the phone if not given. */
  setScale(device: number, controller = device): void {
    this.ch.device.master = Math.max(0, device);
    this.ch.controller.master = Math.max(0, controller);
  }

  /** Calm keeps cues marked `calm` short and soft, for players who asked for less motion. */
  setCalm(on: boolean): void {
    this.calm = on;
  }

  /** Opens or closes the game lane. Closing it stops a running pattern and forgets queued cues. */
  setGameplay(on: boolean): void {
    if (on === this.gameplay) return;
    this.gameplay = on;
    if (on) return;
    for (const id of [...this.pending.keys()])
      if (this.table.cues[id]?.lane === 'game') this.pending.delete(id);
    for (const c of Object.values(this.ch))
      c.queued = c.queued.filter((q) => this.table.cues[q.id]?.lane !== 'game');
    this.stopAll();
  }

  /** Whether the page is visible. Hiding stops everything and forgets what was waiting. */
  setActive(visible: boolean): void {
    if (visible === this.active) return;
    this.active = visible;
    if (visible) return;
    this.pending.clear();
    for (const c of Object.values(this.ch)) c.queued = [];
    this.stopAll();
  }

  private stopAll(): void {
    for (const c of Object.values(this.ch)) c.stop();
  }

  /**
   * Raises a cue by id. It plays at the next `flush` if it passes the lane, strength and cooldown rules.
   * A cue marked `world` happened somewhere in the level and is felt only when `onScreen` is true.
   */
  cue(id: string, scale = 1, onScreen = true): void {
    const cue = this.table.cues[id];
    if (!cue || !this.active) return;
    if (cue.lane === 'game' && !this.gameplay) return;
    if (cue.world && !onScreen) return;
    const w = this.pending.get(id);
    if (w) {
      w.scale = Math.max(w.scale, scale);
      w.count++;
    } else this.pending.set(id, { id, scale, count: 1, order: this.order++ });
  }

  /** Raises the cue a caption maps to, if it has one. */
  caption(text: string, onScreen = true): void {
    const id = this.table.captions[text];
    if (id) this.cue(id, 1, onScreen);
  }

  /** Raises a menu cue (`ui.move`, `ui.select`, and so on). */
  ui(kind: string): void {
    this.cue(`ui.${kind}`);
  }

  /**
   * Plays a cue at once on one target at that target's strength, for a settings screen that lets the player
   * feel a change. It ignores the lane, the cooldown, the route and the budget, but not the strength (Off
   * plays nothing) or a hidden page. Returns whether a play was sent.
   */
  preview(id: string, target: Target): boolean {
    const cue = this.table.cues[id];
    if (!cue || !this.active || this.ch[target].master <= 0) return false;
    this.play(target, { id, scale: 1, count: 1, order: this.order++, cue }, this.clock.now());
    return true;
  }

  /**
   * Plays a pattern now on one target for the lab: at `scale` and nothing else (the strength setting, the
   * lane, the route, the cooldown and the budget do not apply), but not while the page is hidden. Returns
   * what the backend did, or null when the page is hidden. The play shows in `report()` as `audition`.
   */
  audition(pattern: HapticPattern, target: Target, scale = 1): PlayResult | null {
    if (!this.active) return null;
    const ch = this.ch[target];
    const now = this.clock.now();
    const r = ch.backend.play(pattern, Math.max(0, scale));
    if (r.ok) {
      ch.busyUntil = now + r.ms;
      ch.runPriority = 0;
    }
    this.record(target, 'audition', scale, r, now);
    return r;
  }

  /** A copy of the cues as they are now, tuning included, for the lab to show and edit. */
  cues(): Record<string, HapticCue> {
    return structuredClone(this.table.cues);
  }

  /** The compiler constants and budget as they are now, tuning included. */
  tuning(): {
    compile: VibrateCompile;
    rumble: RumbleCompile;
    budget: { onMs: number; windowMs: number };
  } {
    return {
      compile: { ...this.compiler.compile },
      rumble: { ...this.compiler.rumble },
      budget: { ...this.budget },
    };
  }

  private drop(reason: string): void {
    this.dropped[reason] = (this.dropped[reason] ?? 0) + 1;
  }

  /** Plays the strongest waiting cue on each target (one backend call each) and keeps the queued ones that can still wait. */
  flush(): void {
    const queuedAny = this.ch.device.queued.length + this.ch.controller.queued.length > 0;
    if (this.pending.size === 0 && !queuedAny) return;
    const now = this.clock.now();
    const by: Record<Target, Candidate[]> = { device: [], controller: [] };
    for (const w of this.pending.values()) {
      const cue = this.table.cues[w.id];
      if (!cue) continue;
      const target: Target | null =
        cue.lane === 'ui' ? 'device' : this.route === 'none' ? null : this.route;
      if (target === null || this.ch[target].master <= 0) continue;
      const last = this.lastPlay.get(w.id);
      if (last !== undefined && now - last < Math.max(cue.cooldownMs, coalesceMs(cue.policy))) {
        this.drop('cooldown');
        continue;
      }
      const stack = coalesceMs(cue.policy) > 0 ? Math.min(w.count, COALESCE_MAX) - 1 : 0;
      by[target].push({ ...w, scale: w.scale * (1 + COALESCE_STEP * stack), cue, queued: false });
    }
    for (const target of ['device', 'controller'] as const) {
      const ch = this.ch[target];
      for (const q of ch.queued) {
        const cue = this.table.cues[q.id];
        if (cue && !this.pending.has(q.id)) by[target].push({ ...q, cue, queued: true });
      }
      ch.queued = [];
    }
    this.pending.clear();
    for (const target of ['device', 'controller'] as const)
      this.flushTarget(target, by[target], now);
  }

  private flushTarget(target: Target, cands: Candidate[], now: number): void {
    const ch = this.ch[target];
    ch.spent = ch.spent.filter((s) => now - s.t < this.budget.windowMs);
    const len = (c: HapticCue): number => patternLength(c.pattern);
    cands.sort(
      (a, b) =>
        b.cue.priority - a.cue.priority ||
        len(b.cue) - len(a.cue) ||
        (a.queued === b.queued ? a.order - b.order : a.queued ? -1 : 1),
    );
    let played = false;
    const later: Candidate[] = [];
    for (const c of cands) {
      if (played) {
        later.push(c);
        continue;
      }
      const wait = ch.busyUntil - now;
      if (wait > 0) {
        const policy = c.cue.policy;
        const outranked = c.cue.priority < ch.runPriority;
        if (outranked || policy === 'drop-if-busy' || policy === 'queue') {
          if (policy === 'queue' && wait <= QUEUE_WAIT) this.hold(ch, c);
          else this.drop('busy');
          continue;
        }
      }
      if (ch.budgeted && c.cue.priority < 4 && this.spentMs(ch) >= this.budget.onMs) {
        this.drop('budget');
        continue;
      }
      this.play(target, c, now);
      played = true;
    }
    for (const c of later) {
      if (c.cue.policy === 'queue' && ch.busyUntil - now <= QUEUE_WAIT) this.hold(ch, c);
      else this.drop('frame');
    }
  }

  private hold(ch: Channel, c: Waiting): void {
    if (ch.queued.length < QUEUE_MAX)
      ch.queued.push({ id: c.id, scale: c.scale, count: c.count, order: c.order });
  }

  private spentMs(ch: Channel): number {
    return ch.spent.reduce((a, s) => a + s.ms, 0);
  }

  private play(target: Target, c: Waiting & { cue: HapticCue }, now: number): void {
    const ch = this.ch[target];
    const soft = this.calm && c.cue.calm === true;
    const pattern = soft ? calmPattern(c.cue.pattern) : c.cue.pattern;
    const strength = c.scale * ch.master * (c.cue.lane === 'ui' ? UI_BOOST : 1);
    const r = ch.backend.play(pattern, soft ? Math.min(strength, CALM_STRENGTH) : strength);
    if (r.ok) {
      this.lastPlay.set(c.id, now);
      ch.busyUntil = now + r.ms;
      ch.runPriority = c.cue.priority;
      const first = r.compiled?.[0];
      const on = typeof first === 'number' ? onTime(r.compiled as number[]) : r.ms;
      if (ch.budgeted && on > 0) ch.spent.push({ t: now, ms: on });
    } else this.drop(r.reason ?? 'unavailable');
    this.record(target, c.id, c.scale, r, now);
  }

  private record(target: Target, cue: string, scale: number, r: PlayResult, now: number): void {
    this.log.push({
      at: now,
      target,
      cue,
      scale,
      ok: r.ok,
      tier: r.tier,
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.compiled ? { compiled: r.compiled } : {}),
    });
    if (this.log.length > KEEP) this.log.shift();
  }

  /** The last plays with what each compiled to, what was dropped and what each backend can do. */
  report(): HapticReport {
    return {
      caps: {
        device: this.ch.device.backend.caps(),
        controller: this.ch.controller.backend.caps(),
      },
      route: this.route,
      master: { device: this.ch.device.master, controller: this.ch.controller.master },
      plays: [...this.log],
      dropped: { ...this.dropped },
      spentMs: this.spentMs(this.ch.device),
    };
  }

  /**
   * Changes cues, compiler constants or the budget on the fly, from the console or the lab. Anything
   * that does not check out is refused and named; the rest is applied.
   */
  tune(patch: unknown): { applied: string[]; refused: string[] } {
    const applied: string[] = [];
    const refused: string[] = [];
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as HapticTune;
    for (const [id, edit] of Object.entries(p.cues ?? {})) {
      const cue = this.table.cues[id];
      if (!cue) {
        refused.push(`cues.${id} (unknown cue)`);
        continue;
      }
      const e = (edit ?? {}) as NonNullable<HapticTune['cues']>[string];
      const set = (field: string, ok: boolean, apply: () => void): void => {
        if (ok) {
          apply();
          applied.push(`cues.${id}.${field}`);
        } else refused.push(`cues.${id}.${field}`);
      };
      if (e.events !== undefined) {
        const events = readEvents(e.events);
        set('events', events !== null, () => (cue.pattern = { events: events ?? [] }));
      }
      if (e.priority !== undefined)
        set(
          'priority',
          Number.isInteger(e.priority) && e.priority >= 0 && e.priority <= 4,
          () => (cue.priority = e.priority as HapticCue['priority']),
        );
      if (e.cooldownMs !== undefined)
        set(
          'cooldownMs',
          typeof e.cooldownMs === 'number' && e.cooldownMs >= 0 && e.cooldownMs <= 5000,
          () => (cue.cooldownMs = e.cooldownMs as number),
        );
      if (e.policy !== undefined) {
        const pol = e.policy as Policy;
        const ok =
          pol === 'interrupt' ||
          pol === 'queue' ||
          pol === 'drop-if-busy' ||
          (typeof pol === 'object' &&
            pol !== null &&
            typeof pol.coalesce === 'number' &&
            pol.coalesce >= 10 &&
            pol.coalesce <= 500);
        set('policy', ok, () => (cue.policy = pol));
      }
      for (const flag of ['world', 'calm'] as const) {
        const v = e[flag];
        if (v !== undefined)
          set(flag, typeof v === 'boolean', () => {
            if (v) cue[flag] = true;
            else delete cue[flag];
          });
      }
    }
    const compile: Partial<VibrateCompile> = {};
    for (const [key, v] of Object.entries(p.compile ?? {})) {
      const lim = (COMPILE_LIMITS as Record<string, readonly [number, number] | undefined>)[key];
      if (
        lim &&
        typeof v === 'number' &&
        v >= lim[0] &&
        v <= lim[1] &&
        this.ch.device.backend.tune
      ) {
        (compile as Record<string, number>)[key] = v;
        applied.push(`compile.${key}`);
      } else refused.push(`compile.${key}`);
    }
    if (Object.keys(compile).length > 0) {
      this.ch.device.backend.tune?.(compile);
      Object.assign(this.compiler.compile, compile);
    }
    const rumble: Partial<RumbleCompile> = {};
    for (const [key, v] of Object.entries(p.rumble ?? {})) {
      const lim = (RUMBLE_LIMITS as Record<string, readonly [number, number] | undefined>)[key];
      if (
        lim &&
        typeof v === 'number' &&
        v >= lim[0] &&
        v <= lim[1] &&
        this.ch.controller.backend.tuneRumble
      ) {
        (rumble as Record<string, number>)[key] = v;
        applied.push(`rumble.${key}`);
      } else refused.push(`rumble.${key}`);
    }
    if (Object.keys(rumble).length > 0) {
      this.ch.controller.backend.tuneRumble?.(rumble);
      Object.assign(this.compiler.rumble, rumble);
    }
    for (const [key, v] of Object.entries(p.budget ?? {})) {
      const ok =
        (key === 'onMs' && typeof v === 'number' && v >= 0 && v <= 1000) ||
        (key === 'windowMs' && typeof v === 'number' && v >= 100 && v <= 5000);
      if (ok) {
        (this.budget as Record<string, number>)[key] = v as number;
        applied.push(`budget.${key}`);
      } else refused.push(`budget.${key}`);
    }
    return { applied, refused };
  }

  dispose(): void {
    this.pending.clear();
    for (const c of Object.values(this.ch)) {
      c.queued = [];
      c.stop();
      c.backend.dispose();
      c.backend = noneBackend;
    }
  }
}
