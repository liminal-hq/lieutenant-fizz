// Game haptics: turns cues and captions into backend plays, one per frame, never outside a level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noneBackend, type HapticBackend, type PlayResult } from './haptic-backends';
import {
  COMPILE_LIMITS,
  calmPattern,
  onTime,
  patternLength,
  readEvents,
  type HapticCue,
  type HapticTable,
  type Policy,
  type VibrateCompile,
} from './haptic-pattern';

/** One play the backend was asked for, kept for `report()`. */
export interface PlayRecord {
  at: number;
  cue: string;
  scale: number;
  ok: boolean;
  tier: number;
  reason?: string;
  compiled?: PlayResult['compiled'];
}

export interface HapticReport {
  caps: ReturnType<HapticBackend['caps']>;
  master: number;
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
  budget?: { onMs?: number; windowMs?: number };
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

const coalesceMs = (p: Policy): number => (typeof p === 'object' ? p.coalesce : 0);

/**
 * The haptics runtime beside `GameAudio`. The game raises cues through `cue`, `caption` and `ui`; they
 * wait until `flush`, which the game calls once a frame, and then the strongest one plays. Cues in the
 * `game` lane are dropped unless `setGameplay(true)` (a level is being played), and nothing plays or
 * keeps running while the page is hidden.
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
  private backend: HapticBackend = noneBackend;
  private readonly table: HapticTable;
  private master = 1;
  private gameplay = false;
  private active = true;
  private calm = false;
  private order = 0;
  private readonly pending = new Map<string, Waiting>();
  private queued: Waiting[] = [];
  private readonly lastPlay = new Map<string, number>();
  private busyUntil = 0;
  private runPriority = 0;
  private spent: { t: number; ms: number }[] = [];
  private budget = { onMs: 400, windowMs: 1000 };
  private readonly log: PlayRecord[] = [];
  private readonly dropped: Record<string, number> = {};

  constructor(
    table: HapticTable,
    private readonly clock: { now(): number },
  ) {
    // A copy, so tuning one game's table never changes the module's.
    this.table = structuredClone(table);
  }

  /** Swaps the backend, stopping whatever the old one was doing. */
  setBackend(b: HapticBackend): void {
    this.backend.stop();
    this.backend = b;
    this.busyUntil = 0;
    this.runPriority = 0;
  }

  /** The master strength: 0 turns haptics off, 1 is the pattern as written. */
  setScale(master: number): void {
    this.master = Math.max(0, master);
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
    this.queued = this.queued.filter((q) => this.table.cues[q.id]?.lane !== 'game');
    this.stopAll();
  }

  /** Whether the page is visible. Hiding stops everything and forgets what was waiting. */
  setActive(visible: boolean): void {
    if (visible === this.active) return;
    this.active = visible;
    if (visible) return;
    this.pending.clear();
    this.queued = [];
    this.stopAll();
  }

  private stopAll(): void {
    this.backend.stop();
    this.busyUntil = 0;
    this.runPriority = 0;
  }

  /**
   * Raises a cue by id. It plays at the next `flush` if it passes the lane, strength and cooldown rules.
   * A cue marked `world` happened somewhere in the level and is felt only when `onScreen` is true.
   */
  cue(id: string, scale = 1, onScreen = true): void {
    const cue = this.table.cues[id];
    if (!cue || !this.active || this.master <= 0) return;
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

  private drop(reason: string): void {
    this.dropped[reason] = (this.dropped[reason] ?? 0) + 1;
  }

  /** Plays the strongest waiting cue (one backend call per frame) and keeps the queued ones that can still wait. */
  flush(): void {
    if (this.pending.size === 0 && this.queued.length === 0) return;
    const now = this.clock.now();
    this.spent = this.spent.filter((s) => now - s.t < this.budget.windowMs);

    const cands: (Waiting & { cue: HapticCue; queued: boolean })[] = [];
    for (const w of this.pending.values()) {
      const cue = this.table.cues[w.id];
      if (!cue) continue;
      const last = this.lastPlay.get(w.id);
      if (last !== undefined && now - last < Math.max(cue.cooldownMs, coalesceMs(cue.policy))) {
        this.drop('cooldown');
        continue;
      }
      const stack = coalesceMs(cue.policy) > 0 ? Math.min(w.count, COALESCE_MAX) - 1 : 0;
      cands.push({ ...w, scale: w.scale * (1 + COALESCE_STEP * stack), cue, queued: false });
    }
    for (const q of this.queued) {
      const cue = this.table.cues[q.id];
      if (cue && !this.pending.has(q.id)) cands.push({ ...q, cue, queued: true });
    }
    this.pending.clear();
    this.queued = [];

    const len = (c: HapticCue): number => patternLength(c.pattern);
    cands.sort(
      (a, b) =>
        b.cue.priority - a.cue.priority ||
        len(b.cue) - len(a.cue) ||
        (a.queued === b.queued ? a.order - b.order : a.queued ? -1 : 1),
    );

    let played = false;
    const later: typeof cands = [];
    for (const c of cands) {
      if (played) {
        later.push(c);
        continue;
      }
      const wait = this.busyUntil - now;
      if (wait > 0) {
        const policy = c.cue.policy;
        const outranked = c.cue.priority < this.runPriority;
        if (outranked || policy === 'drop-if-busy' || policy === 'queue') {
          if (policy === 'queue' && wait <= QUEUE_WAIT) this.hold(c);
          else this.drop('busy');
          continue;
        }
      }
      if (c.cue.priority < 4 && this.spentMs() >= this.budget.onMs) {
        this.drop('budget');
        continue;
      }
      this.play(c, now);
      played = true;
    }
    for (const c of later) {
      if (c.cue.policy === 'queue' && this.busyUntil - now <= QUEUE_WAIT) this.hold(c);
      else this.drop('frame');
    }
  }

  private hold(c: Waiting): void {
    if (this.queued.length < QUEUE_MAX)
      this.queued.push({ id: c.id, scale: c.scale, count: c.count, order: c.order });
  }

  private spentMs(): number {
    return this.spent.reduce((a, s) => a + s.ms, 0);
  }

  private play(c: Waiting & { cue: HapticCue }, now: number): void {
    const soft = this.calm && c.cue.calm === true;
    const pattern = soft ? calmPattern(c.cue.pattern) : c.cue.pattern;
    const strength = c.scale * this.master;
    const r = this.backend.play(pattern, soft ? Math.min(strength, CALM_STRENGTH) : strength);
    if (r.ok) {
      this.lastPlay.set(c.id, now);
      this.busyUntil = now + r.ms;
      this.runPriority = c.cue.priority;
      const on =
        r.compiled && r.compiled.every((n) => typeof n === 'number') ? onTime(r.compiled) : r.ms;
      if (on > 0) this.spent.push({ t: now, ms: on });
    } else this.drop(r.reason ?? 'unavailable');
    this.log.push({
      at: now,
      cue: c.id,
      scale: c.scale,
      ok: r.ok,
      tier: r.tier,
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.compiled ? { compiled: r.compiled } : {}),
    });
    if (this.log.length > KEEP) this.log.shift();
  }

  /** The last plays with what each compiled to, what was dropped and what the backend can do. */
  report(): HapticReport {
    return {
      caps: this.backend.caps(),
      master: this.master,
      plays: [...this.log],
      dropped: { ...this.dropped },
      spentMs: this.spentMs(),
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
      if (lim && typeof v === 'number' && v >= lim[0] && v <= lim[1] && this.backend.tune) {
        (compile as Record<string, number>)[key] = v;
        applied.push(`compile.${key}`);
      } else refused.push(`compile.${key}`);
    }
    if (Object.keys(compile).length > 0) this.backend.tune?.(compile);
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
    this.queued = [];
    this.backend.stop();
    this.backend.dispose();
    this.backend = noneBackend;
  }
}
