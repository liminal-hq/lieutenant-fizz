// Re-runs the sim with the inputs a play sample recorded, and checks the run against what was recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { num, type Session, type SessionEvent } from '@lieutenant-fizz/engine/session/log';
import { Ev, State } from '../sim/protocol';
import type { Sim, SimEvent } from '../sim/sim';
import { attemptsOf, type Attempt } from './attempts';
import { entryAt, LATE_TICKS, type Entry } from './entry';
import { FizzTracker } from './fizz';

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
  /** How the attempt ended and what the viewer shows of it (outcome, death, path, pauses). */
  info: Attempt | null;
}

/** The first place a replay stopped matching the recording. */
export interface Drift {
  tick: number;
  kind: 'pos' | 'st' | 'death' | 'clear';
  recorded: string;
  replayed: string;
}

/** Every attempt in a session, in order. */
export function findAttempts(session: Session): ReplayAttempt[] {
  const events = session.events;
  const starts: number[] = [];
  events.forEach((e, i) => {
    if (e.e === 'level') starts.push(i);
  });
  const infos = attemptsOf(session);
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
      info: infos.length === starts.length ? (infos[n] ?? null) : null,
    };
  });
}

/** The recorded state at a tick: what the sim must read after the step that ended on it. */
interface RecordedState {
  lives: number;
  ammo: number;
  score: number;
  pogo: number;
}

/**
 * Drives a sim through one attempt at a time. It never touches the page, storage or the player's own game: give it
 * a sim of its own. Replay ticks are the recorded ticks, so `tick` lines up with the log's `t`.
 */
export class Replayer {
  readonly events: readonly SessionEvent[];
  readonly attempts: ReplayAttempt[];
  /** The recorded tick the replay is at. */
  tick = 0;
  /** The first mismatch with the recording, or null while the run still matches. */
  drift: Drift | null = null;
  /** The tick Ben died on in the replay, or null. */
  deathTick: number | null = null;
  /** The tick the level was cleared on in the replay, or null. */
  clearTick: number | null = null;
  /** How many recorded positions the replay has been compared against so far. */
  checked = 0;
  /** What the sim raised on the last `step` (captions, a clear, a death), for a host to play or show. */
  lastEvents: SimEvent[] = [];
  /** Where Ben's fizz bubbles went in the attempt so far. */
  readonly fizz = new FizzTracker();

  private index = -1;
  private current: ReplayAttempt | null = null;
  private late = 0;
  private readonly inTicks: number[] = [];
  private readonly inBits: number[] = [];
  private pos = new Map<number, { x: number; y: number }>();
  private st = new Map<number, RecordedState>();
  private recordedDeath: SessionEvent | null = null;
  private recordedClear: SessionEvent | null = null;

  constructor(
    readonly sim: Sim,
    session: Session,
  ) {
    this.events = session.events;
    for (const e of this.events) {
      if (e.e !== 'in') continue;
      this.inTicks.push(e.t);
      this.inBits.push(num(e, 'b'));
    }
    this.attempts = findAttempts(session);
  }

  /** The attempt loaded now, or null. */
  get attempt(): ReplayAttempt | null {
    return this.current;
  }

  /** Which attempt is loaded, or -1. */
  get attemptIndex(): number {
    return this.index;
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

  /**
   * Starts attempt `i` from its entry state, so the next `step` is the level's first. A sample that did not write
   * its entry down may have stamped its `level` event a few ticks late, and Ben standing still at the start hides
   * that until something else moves, so each of the last `LATE_TICKS` ticks is tried by running the whole attempt:
   * the first that matches all the way is the start, and if none does, the one that matched longest.
   */
  load(i: number): void {
    const attempt = this.attempts[i];
    const entry = attempt?.entry;
    if (!attempt || !entry) throw new Error(`attempt ${i} cannot be replayed`);
    let best = 0;
    if (entry.inferred) {
      let longest = -1;
      for (let k = 0; k <= LATE_TICKS; k++) {
        this.begin(i, entry.tick - k);
        this.run();
        if (!this.drift) {
          best = k;
          break;
        }
        if (this.drift.tick > longest) {
          longest = this.drift.tick;
          best = k;
        }
      }
    }
    // Start again, fresh, from the start that was found (or the recorded one when the entry was written down).
    this.begin(i, entry.tick - best);
  }

  /** Sets the sim up for attempt `i`, entered on `startTick`. */
  private begin(i: number, startTick: number): void {
    const attempt = this.attempts[i]!;
    const entry = attempt.entry!;
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
    // An entry worked out afterwards takes the input in force on the start tick it is trying; a written one is exact.
    sim.step(entry.inferred ? this.wordAt(startTick) : entry.held);
    sim.x.set_view(11.5, 6.5);
    sim.x.enter_level(entry.level);
    sim.drainEvents();
    // A Phantom's teleport reads the absolute tick, so the attempt starts on the tick it was entered on.
    sim.set(State.TICK, startTick);

    this.index = i;
    this.current = attempt;
    this.tick = startTick;
    this.late = entry.tick - startTick;
    this.drift = null;
    this.deathTick = null;
    this.clearTick = null;
    this.checked = 0;
    this.fizz.reset();
    this.pos = new Map();
    this.st = new Map();
    this.recordedDeath = null;
    this.recordedClear = null;
    for (let k = attempt.index; k < attempt.end; k++) {
      const e = this.events[k]!;
      if (e.e === 'pos') this.pos.set(e.t, { x: num(e, 'x'), y: num(e, 'y') });
      else if (e.e === 'st') {
        this.st.set(e.t, {
          lives: num(e, 'lives'),
          ammo: num(e, 'ammo'),
          score: num(e, 'score'),
          pogo: num(e, 'pogo'),
        });
      } else if (e.e === 'death' && !this.recordedDeath) this.recordedDeath = e;
      else if (e.e === 'ev' && e['k'] === 'level_complete' && !this.recordedClear) {
        this.recordedClear = e;
      }
    }
  }

  /** The tick the entering step was stamped late by, in ticks (0 when it was stamped exactly). */
  get lateBy(): number {
    return this.late;
  }

  /** Runs one tick with the recorded input and compares it with the recording. */
  step(): void {
    const { sim } = this;
    sim.step(this.wordAt(this.tick + 1));
    this.tick += 1;
    this.lastEvents = sim.drainEvents();
    this.fizz.observe(this.tick, sim.benShots());
    for (const e of this.lastEvents) {
      if (e.kind === Ev.LEVEL_COMPLETE && this.clearTick === null) this.noteClear();
    }

    const pos = this.pos.get(this.tick);
    if (pos) this.checkPos(pos);
    const st = this.st.get(this.tick);
    if (st) this.checkState(st);
    if (this.deathTick === null && sim.get(State.PLAYER_DEAD) === 1) this.noteDeath();
    // Reaching the end of the recorded attempt, by playing or by a seek, is when a death or a clear the recording
    // has and the replay did not produce shows.
    if (this.tick >= (this.current?.endTick ?? Infinity)) this.checkEnd();
  }

  private noteClear(): void {
    this.clearTick = this.tick;
    const recorded = this.recordedClear?.t ?? null;
    // An event of an older sample may be stamped late; a stamped-exactly one must match.
    const lateBy = this.current?.entry?.inferred ? LATE_TICKS : 0;
    const ok = recorded !== null && this.tick <= recorded && this.tick >= recorded - lateBy;
    if (!ok) {
      this.mismatch({
        tick: this.tick,
        kind: 'clear',
        recorded: recorded === null ? 'no clear' : `tick ${recorded}`,
        replayed: `tick ${this.tick}`,
      });
    }
  }

  private noteDeath(): void {
    this.deathTick = this.tick;
    const recorded = this.recordedDeath?.t ?? null;
    if (recorded !== this.tick) {
      this.mismatch({
        tick: this.tick,
        kind: 'death',
        recorded: recorded === null ? 'no death' : `tick ${recorded}`,
        replayed: `tick ${this.tick}`,
      });
    }
  }

  private checkPos(expected: { x: number; y: number }): void {
    this.checked += 1;
    const x = this.sim.get(State.PLAYER_X);
    const y = this.sim.get(State.PLAYER_Y);
    if (Math.abs(x - expected.x) > POS_TOLERANCE || Math.abs(y - expected.y) > POS_TOLERANCE) {
      this.mismatch({
        tick: this.tick,
        kind: 'pos',
        recorded: `${expected.x}, ${expected.y}`,
        replayed: `${x.toFixed(2)}, ${y.toFixed(2)}`,
      });
    }
  }

  private checkState(expected: RecordedState): void {
    const { sim } = this;
    const got: RecordedState = {
      lives: sim.get(State.LIVES),
      ammo: sim.get(State.AMMO),
      score: sim.get(State.SCORE),
      pogo: sim.get(State.POGO_ON),
    };
    if (
      got.lives !== expected.lives ||
      got.ammo !== expected.ammo ||
      got.score !== expected.score ||
      got.pogo !== expected.pogo
    ) {
      const text = (s: RecordedState): string =>
        `lives ${s.lives}, ammo ${s.ammo}, score ${s.score}, pogo ${s.pogo}`;
      this.mismatch({ tick: this.tick, kind: 'st', recorded: text(expected), replayed: text(got) });
    }
  }

  /** Keeps the first mismatch only. */
  private mismatch(d: Drift): void {
    this.drift ??= d;
  }

  /**
   * Runs until Ben dies or the attempt's recorded events run out, then checks that a death or a clear the
   * recording has also happened in the replay.
   */
  run(): void {
    const end = this.current?.endTick ?? 0;
    while (this.deathTick === null && this.tick < end) this.step();
    this.checkEnd();
  }

  /** Whether the recording's death or clear is missing from the replay once it has run as far as the recording. */
  private checkEnd(): void {
    const end = this.current?.endTick ?? 0;
    if (this.tick < end && this.deathTick === null) return;
    if (this.recordedDeath && this.deathTick === null) {
      this.mismatch({
        tick: this.tick,
        kind: 'death',
        recorded: `tick ${this.recordedDeath.t}`,
        replayed: 'no death',
      });
    }
    if (this.recordedClear && this.clearTick === null && this.deathTick === null) {
      this.mismatch({
        tick: this.tick,
        kind: 'clear',
        recorded: `tick ${this.recordedClear.t}`,
        replayed: 'no clear',
      });
    }
  }

  /**
   * Moves to a tick of the loaded attempt: forward by running, backward by starting the attempt again and
   * running up to it. A tick outside the attempt is moved into it.
   */
  seek(tick: number): void {
    const attempt = this.current;
    if (!attempt) return;
    const first = attempt.startTick - this.late;
    const target = Math.min(Math.max(Math.round(tick), first), attempt.endTick);
    if (target < this.tick) this.begin(this.index, first);
    while (this.tick < target) this.step();
  }
}
