// Game haptics: turns cues and captions into backend plays, one per frame, never outside a level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noneBackend, type HapticBackend, type PlayResult } from './haptic-backends';
import type { HapticTable } from './haptic-pattern';

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

const KEEP = 20;

/**
 * The haptics runtime beside `GameAudio`. The game raises cues through `cue`, `caption` and `ui`; they
 * wait until `flush`, which the game calls once a frame, and then the strongest one plays. Cues in the
 * `game` lane are dropped unless `setGameplay(true)` (a level is being played), and nothing plays or
 * keeps running while the page is hidden.
 */
export class GameHaptics {
  private backend: HapticBackend = noneBackend;
  private master = 1;
  private gameplay = false;
  private active = true;
  private readonly pending = new Map<string, number>();
  private readonly lastPlay = new Map<string, number>();
  private readonly log: PlayRecord[] = [];

  constructor(
    private readonly table: HapticTable,
    private readonly clock: { now(): number },
  ) {}

  /** Swaps the backend, stopping whatever the old one was doing. */
  setBackend(b: HapticBackend): void {
    this.backend.stop();
    this.backend = b;
  }

  /** The master strength: 0 turns haptics off, 1 is the pattern as written. */
  setScale(master: number): void {
    this.master = Math.max(0, master);
  }

  /** Opens or closes the game lane. Closing it stops a running pattern and forgets queued cues. */
  setGameplay(on: boolean): void {
    if (on === this.gameplay) return;
    this.gameplay = on;
    if (on) return;
    for (const id of [...this.pending.keys()])
      if (this.table.cues[id]?.lane === 'game') this.pending.delete(id);
    this.backend.stop();
  }

  /** Whether the page is visible. Hiding stops everything and forgets what was waiting. */
  setActive(visible: boolean): void {
    if (visible === this.active) return;
    this.active = visible;
    if (visible) return;
    this.pending.clear();
    this.backend.stop();
  }

  /** Raises a cue by id. It plays at the next `flush` if it passes the lane, volume and cooldown rules. */
  cue(id: string, scale = 1): void {
    const cue = this.table.cues[id];
    if (!cue || !this.active || this.master <= 0) return;
    if (cue.lane === 'game' && !this.gameplay) return;
    this.pending.set(id, Math.max(scale, this.pending.get(id) ?? 0));
  }

  /** Raises the cue a caption maps to, if it has one. */
  caption(text: string): void {
    const id = this.table.captions[text];
    if (id) this.cue(id);
  }

  /** Raises a menu cue (`ui.move`, `ui.select`, and so on). */
  ui(kind: string): void {
    this.cue(`ui.${kind}`);
  }

  /** Plays the strongest waiting cue (one backend call per frame), then clears the rest. */
  flush(): void {
    if (this.pending.size === 0) return;
    const now = this.clock.now();
    let best: string | null = null;
    for (const id of this.pending.keys()) {
      const cue = this.table.cues[id];
      if (!cue) continue;
      const last = this.lastPlay.get(id);
      if (last !== undefined && now - last < cue.cooldownMs) continue;
      if (best === null || cue.priority > (this.table.cues[best]?.priority ?? 0)) best = id;
    }
    const scale = best === null ? 0 : (this.pending.get(best) ?? 1);
    this.pending.clear();
    const cue = best === null ? undefined : this.table.cues[best];
    if (best === null || !cue) return;
    this.lastPlay.set(best, now);
    const r = this.backend.play(cue.pattern, scale * this.master);
    this.remember({
      at: now,
      cue: best,
      scale,
      ok: r.ok,
      tier: r.tier,
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.compiled ? { compiled: r.compiled } : {}),
    });
  }

  private remember(r: PlayRecord): void {
    this.log.push(r);
    if (this.log.length > KEEP) this.log.shift();
  }

  /** The last plays with what each compiled to, and what the backend can do. */
  report(): {
    caps: ReturnType<HapticBackend['caps']>;
    master: number;
    plays: readonly PlayRecord[];
  } {
    return { caps: this.backend.caps(), master: this.master, plays: [...this.log] };
  }

  dispose(): void {
    this.pending.clear();
    this.backend.stop();
    this.backend.dispose();
    this.backend = noneBackend;
  }
}
