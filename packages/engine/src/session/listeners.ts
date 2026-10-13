// What the page tells a session recorder: every pointer, key and pad press, the window resizing, and the page being hidden.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SessionRecorder } from './recorder';

/** Moves of a held pointer closer in time and distance than this are dropped, so a drag is a path, not a flood. */
export const MOVE_MIN_MS = 16;
export const MOVE_MIN_PX = 2;

/** The part of the window and document the listeners use, so tests can pass fakes. */
export interface ListenTarget {
  // `any`: the browser's `addEventListener` is overloaded per event type, and a handler for one type is not
  // a handler for another, which no single parameter type can say.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(type: string, fn: (e: any) => void, options?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener(type: string, fn: (e: any) => void, options?: unknown): void;
}

export interface ListenEnv {
  win: ListenTarget & { innerWidth?: number; innerHeight?: number };
  doc: ListenTarget & { visibilityState?: string };
  /** Names what is under a pointer ("ctl:jump", "menu:Options"), or null for the game or nothing. */
  locate?(x: number, y: number, target: unknown): string | null;
}

interface PointerLike {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  timeStamp: number;
  target: unknown;
}

interface KeyLike {
  code: string;
  repeat: boolean;
  isComposing?: boolean;
  target: unknown;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** True for a text field, where a key is a letter being typed and not a game input. */
export function isTextTarget(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!t || typeof t !== 'object') return false;
  const tag = (t.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

/**
 * Starts reporting the page to a recorder and returns a function that stops. Pointer events are recorded on
 * the way down, up and cancel, and while held (throttled); keys are recorded by physical code (never the
 * character) and never in a text field; the page being hidden also asks the recorder to write what it has.
 */
export function listenToPage(rec: SessionRecorder, env: ListenEnv): () => void {
  const held = new Map<number, { x: number; y: number; at: number }>();
  const off: (() => void)[] = [];
  const on = <E>(t: ListenTarget, type: string, fn: (e: E) => void, options?: unknown): void => {
    t.addEventListener(type, fn, options);
    off.push(() => t.removeEventListener(type, fn, options));
  };

  const pointer =
    (k: 'down' | 'move' | 'up' | 'cancel') =>
    (e: PointerLike): void => {
      const x = round(e.clientX);
      const y = round(e.clientY);
      if (k === 'move') {
        const h = held.get(e.pointerId);
        if (!h) return;
        if (e.timeStamp - h.at < MOVE_MIN_MS) return;
        if (Math.abs(x - h.x) < MOVE_MIN_PX && Math.abs(y - h.y) < MOVE_MIN_PX) return;
        held.set(e.pointerId, { x, y, at: e.timeStamp });
        rec.record('ptr', { k, id: e.pointerId, ty: e.pointerType, x, y });
        return;
      }
      if (k === 'down') held.set(e.pointerId, { x, y, at: e.timeStamp });
      else held.delete(e.pointerId);
      const at = env.locate?.(x, y, e.target) ?? undefined;
      rec.record('ptr', { k, id: e.pointerId, ty: e.pointerType, x, y, ...(at ? { on: at } : {}) });
    };
  const capture = { capture: true, passive: true };
  on(env.win, 'pointerdown', pointer('down'), capture);
  on(env.win, 'pointermove', pointer('move'), capture);
  on(env.win, 'pointerup', pointer('up'), capture);
  on(env.win, 'pointercancel', pointer('cancel'), capture);

  const key =
    (down: boolean) =>
    (e: KeyLike): void => {
      if (e.repeat || e.isComposing || isTextTarget(e.target)) return;
      rec.record('key', { k: e.code, down });
    };
  on(env.win, 'keydown', key(true), capture);
  on(env.win, 'keyup', key(false), capture);

  on(env.doc, 'visibilitychange', () => {
    const v = env.doc.visibilityState === 'hidden' ? 'hidden' : 'visible';
    rec.record('vis', { v });
    if (v === 'hidden') void rec.flush();
  });
  on(env.win, 'pagehide', () => {
    rec.record('vis', { v: 'gone' });
    void rec.flush();
  });
  on(env.win, 'resize', () => {
    rec.record('rs', { w: env.win.innerWidth ?? 0, h: env.win.innerHeight ?? 0 });
  });

  return () => {
    for (const f of off.splice(0)) f();
    held.clear();
  };
}

/** A gamepad as the Gamepad API gives it, reduced to what is read. */
export interface PadLike {
  index: number;
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

/** What was last seen of the pads, to find what changed. */
export type PadMemory = Map<number, { buttons: boolean[]; axes: number[] }>;

/** An axis is reported when its value, to a tenth, changes; a pad at rest says nothing. */
const tenths = (v: number): number => Math.round(v * 10) / 10;

/**
 * Compares the pads now with the pads before and records each change: a button going down or up, and an axis
 * moving by a tenth. Call it once a frame.
 */
export function pollPads(
  rec: SessionRecorder,
  pads: readonly (PadLike | null)[],
  memory: PadMemory,
): void {
  const seen = new Set<number>();
  for (const pad of pads) {
    if (!pad) continue;
    seen.add(pad.index);
    const before = memory.get(pad.index);
    const buttons = pad.buttons.map((b) => b.pressed);
    const axes = pad.axes.map(tenths);
    if (before) {
      buttons.forEach((down, b) => {
        if (down !== (before.buttons[b] ?? false)) rec.record('pad', { i: pad.index, b, down });
      });
      axes.forEach((v, a) => {
        if (v !== (before.axes[a] ?? 0)) rec.record('ax', { i: pad.index, a, v });
      });
    }
    memory.set(pad.index, { buttons, axes });
  }
  // A pad that has gone loses its memory, so one that comes back is read afresh.
  for (const index of [...memory.keys()]) if (!seen.has(index)) memory.delete(index);
}
