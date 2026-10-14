// The Episode 1 side of a play sample: turns what the game does (screens, menus, levels, Ben's path, events) into log events.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { pollPads, type PadLike, type PadMemory } from '@lieutenant-fizz/engine/session/listeners';
import type { SessionRecorder } from '@lieutenant-fizz/engine/session/recorder';
import { Ev, State } from '../sim/protocol';

/** Ben's position is written this often while he is in a level, in ticks (15 times a second). */
export const PATH_EVERY = 4;

/** What the sample reads of the game; the game passes itself in a small shape, tests pass fakes. */
export interface SampleView {
  /** A value of the simulation's state. */
  get(index: number): number;
  /** True while Ben is in a level (not on the map or a menu). */
  inLevel(): boolean;
  levelName(id: number): string;
  captionName(index: number): string;
  toastName(index: number): string;
  /** The gamepads now, or none where the browser has no pad API. */
  pads(): readonly (PadLike | null)[];
}

const EV_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(Ev).map(([name, value]) => [value, name.toLowerCase()]),
);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Records one session's worth of game events. It never changes anything in the game: it only reads, through the
 * view, and writes to the recorder. Calls before the recorder has started are dropped by the recorder itself.
 */
export class PlaySample {
  private ticks = 0;
  private bits = 0;
  private dead = false;
  private last = { lives: NaN, ammo: NaN, score: NaN, pogo: NaN };
  private readonly attempts = new Map<number, number>();
  private readonly pads: PadMemory = new Map();
  private options = '';

  constructor(
    private readonly rec: SessionRecorder,
    private readonly view: SampleView,
  ) {}

  /** After each fixed step: the input word when it changes, the path, the state and a death. */
  tick(bits: number): void {
    this.ticks += 1;
    if (bits !== this.bits) {
      this.bits = bits;
      this.rec.record('in', { b: bits });
    }
    pollPads(this.rec, this.view.pads(), this.pads);
    if (!this.view.inLevel()) {
      this.dead = false;
      return;
    }
    const dead = this.view.get(State.PLAYER_DEAD) === 1;
    if (dead && !this.dead) {
      const x = this.view.get(State.PLAYER_X);
      const y = this.view.get(State.PLAYER_Y);
      this.rec.record('death', {
        cause: this.view.get(State.DEATH_CAUSE),
        detail: this.view.get(State.DEATH_DETAIL),
        x: round2(x),
        y: round2(y),
      });
    }
    this.dead = dead;
    if (this.ticks % PATH_EVERY === 0) {
      this.rec.record('pos', {
        x: round2(this.view.get(State.PLAYER_X)),
        y: round2(this.view.get(State.PLAYER_Y)),
      });
      this.state();
    }
  }

  /** Lives, ammo, score and the pogo toggle, written only when one of them changes. */
  private state(): void {
    const now = {
      lives: this.view.get(State.LIVES),
      ammo: this.view.get(State.AMMO),
      score: this.view.get(State.SCORE),
      pogo: this.view.get(State.POGO_ON),
    };
    if (
      now.lives === this.last.lives &&
      now.ammo === this.last.ammo &&
      now.score === this.last.score &&
      now.pogo === this.last.pogo
    )
      return;
    this.last = now;
    this.rec.record('st', now);
  }

  /** The screen the game is showing changed. */
  screen(to: string): void {
    this.rec.record('screen', { to });
  }

  /** A screen over the menu opened or closed (null is none). */
  sub(to: string | null): void {
    this.rec.record('sub', { to });
  }

  /** The menu selection moved to a row, named by its label where the game has one. */
  menu(i: number, label?: string): void {
    this.rec.record('menu', label ? { i, label } : { i });
  }

  /** The player's options, written whenever they differ from the last time. */
  settings(options: object): void {
    const text = JSON.stringify(options);
    if (text === this.options) return;
    this.options = text;
    this.rec.record('opt', { o: options });
  }

  /** What the simulation reported. The HUD event comes every few ticks and carries nothing the state does not. */
  simEvent(e: { kind: number; a: number; b: number; c: number }): void {
    if (e.kind === Ev.HUD) return;
    const k = EV_NAMES[e.kind] ?? `kind${e.kind}`;
    if (e.kind === Ev.LEVEL_START) {
      const n = (this.attempts.get(e.a) ?? 0) + 1;
      this.attempts.set(e.a, n);
      this.rec.record('level', { id: e.a, name: this.view.levelName(e.a), attempt: n });
      return;
    }
    const fields: Record<string, unknown> = { k, a: round2(e.a), b: round2(e.b), c: round2(e.c) };
    if (e.kind === Ev.CAPTION) fields['n'] = this.view.captionName(e.a);
    if (e.kind === Ev.TOAST) fields['n'] = this.view.toastName(e.a);
    this.rec.record('ev', fields);
  }
}
