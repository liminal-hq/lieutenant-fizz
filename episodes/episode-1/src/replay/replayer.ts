// Re-runs the sim with the inputs a play sample recorded, and checks the run against what was recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { State } from '../sim/protocol';
import type { Sim } from '../sim/sim';
import { entryAt, type Entry } from './entry';
import { num, type LogEvent } from './log';

/** How far a replayed position may be from a recorded one: the log rounds to two decimals, so half a hundredth each way plus a margin. */
export const POS_TOLERANCE = 0.011;

/** One go at a level: from its `level` event to the next one. */
export interface ReplayAttempt {
  /** Index of the `level` event in the log. */
  index: number;
  /** Index after the attempt's last event. */
  end: number;
  id: number;
  name: string;
  /** The attempt number the recorder counted for this level. */
  attempt: number;
  /** The state to start from, or null when the log does not hold enough to work it out. */
  entry: Entry | null;
  /** The recorded tick of the entering step. */
  startTick: number;
  /** The tick of the attempt's last recorded event. */
  endTick: number;
}

/** The first place a replay stopped matching the recording. */
export interface Drift {
  tick: number;
  kind: 'pos' | 'death';
  recorded: string;
  replayed: string;
}

/** Every attempt in a log, in order. */
export function findAttempts(events: readonly LogEvent[]): ReplayAttempt[] {
  const starts: number[] = [];
  events.forEach((e, i) => {
    if (e.e === 'level') starts.push(i);
  });
  return starts.map((index, n) => {
    const end = starts[n + 1] ?? events.length;
    const level = events[index]!;
    return {
      index,
      end,
      id: num(level, 'id'),
      name: typeof level['name'] === 'string' ? level['name'] : `level ${num(level, 'id')}`,
      attempt: num(level, 'attempt', n + 1),
      entry: entryAt(events, index),
      startTick: level.t,
      endTick: events[end - 1]?.t ?? level.t,
    };
  });
}

/**
 * Drives a sim through one attempt at a time. It never touches the page, storage or the player's own game: give it
 * a sim of its own. Replay ticks are the recorded ticks, so `tick` lines up with the log's `t`.
 */
export class Replayer {
  readonly attempts: ReplayAttempt[];
  /** The recorded tick the replay is at. */
  tick = 0;
  /** The first mismatch with the recording, or null while the run still matches. */
  drift: Drift | null = null;
  /** The tick Ben died on in the replay, or null. */
  deathTick: number | null = null;
  /** How many recorded positions the replay has been compared against so far. */
  checked = 0;

  private current: ReplayAttempt | null = null;
  private readonly inTicks: number[] = [];
  private readonly inBits: number[] = [];
  private pos = new Map<number, { x: number; y: number }>();
  private recordedDeath: LogEvent | null = null;

  constructor(
    readonly sim: Sim,
    readonly events: readonly LogEvent[],
  ) {
    for (const e of events) {
      if (e.e !== 'in') continue;
      this.inTicks.push(e.t);
      this.inBits.push(num(e, 'b'));
    }
    this.attempts = findAttempts(events);
  }

  /** The input word the step that ends on `tick` ran with: the last `in` at or before it, zero before the first. */
  wordAt(tick: number): number {
    let lo = 0;
    let hi = this.inTicks.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.inTicks[mid]! <= tick) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found < 0 ? 0 : this.inBits[found]!;
  }

  /** Starts attempt `i` from its entry state, so the next `step` is the level's first. */
  load(i: number): void {
    const attempt = this.attempts[i];
    const entry = attempt?.entry;
    if (!attempt || !entry) throw new Error(`attempt ${i} cannot be replayed`);
    const { sim } = this;
    sim.x.game_new();
    sim.set(State.LIVES, entry.lives);
    sim.set(State.AMMO, entry.ammo);
    sim.set(State.SCORE, entry.score);
    sim.set(State.NEXT_LIFE, entry.next);
    sim.set(State.DONE_MASK, entry.done);
    if (entry.pogoH !== null) sim.set(State.POGO_HEIGHT, entry.pogoH);
    // A step with no mode set only takes the input, so the sim's previous input is what the entering step held.
    sim.x.enter_none();
    sim.step(entry.held);
    sim.x.set_view(11.5, 6.5);
    sim.x.enter_level(entry.level);
    sim.drainEvents();
    // A Phantom's teleport reads the absolute tick, so the attempt starts on the tick it was entered on.
    sim.set(State.TICK, entry.tick);

    this.current = attempt;
    this.tick = entry.tick;
    this.drift = null;
    this.deathTick = null;
    this.checked = 0;
    this.pos = new Map();
    this.recordedDeath = null;
    for (let k = attempt.index; k < attempt.end; k++) {
      const e = this.events[k]!;
      if (e.e === 'pos') this.pos.set(e.t, { x: num(e, 'x'), y: num(e, 'y') });
      else if (e.e === 'death' && !this.recordedDeath) this.recordedDeath = e;
    }
  }

  /** Runs one tick with the recorded input and compares it with the recording. */
  step(): void {
    const { sim } = this;
    sim.step(this.wordAt(this.tick + 1));
    this.tick += 1;
    sim.drainEvents();

    const expected = this.pos.get(this.tick);
    if (expected) this.checked += 1;
    if (expected && !this.drift) {
      const x = sim.get(State.PLAYER_X);
      const y = sim.get(State.PLAYER_Y);
      if (Math.abs(x - expected.x) > POS_TOLERANCE || Math.abs(y - expected.y) > POS_TOLERANCE) {
        this.drift = {
          tick: this.tick,
          kind: 'pos',
          recorded: `${expected.x}, ${expected.y}`,
          replayed: `${x.toFixed(2)}, ${y.toFixed(2)}`,
        };
      }
    }
    if (this.deathTick === null && sim.get(State.PLAYER_DEAD) === 1) {
      this.deathTick = this.tick;
      const recorded = this.recordedDeath?.t ?? null;
      if (recorded !== this.tick && !this.drift) {
        this.drift = {
          tick: this.tick,
          kind: 'death',
          recorded: recorded === null ? 'no death' : `tick ${recorded}`,
          replayed: `tick ${this.tick}`,
        };
      }
    }
  }

  /** Runs until Ben dies or the attempt's recorded events run out. */
  run(): void {
    const end = this.current?.endTick ?? 0;
    while (this.deathTick === null && this.tick < end) this.step();
  }
}
