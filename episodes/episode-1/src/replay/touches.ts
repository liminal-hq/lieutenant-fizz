// Reads the touches of an attempt from a play sample: which landed on a control, which missed, and where the controls were.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Finger } from '@lieutenant-fizz/engine/replay/overlay';
import { num, type Session, type SessionEvent } from '@lieutenant-fizz/engine/session/log';
import {
  DEFAULT_TOUCH_SETTINGS,
  SIZES,
  touchSpec,
  type TouchSize,
} from '@lieutenant-fizz/engine/touch-settings';
import {
  placeControls,
  type Insets,
  type PlacedControls,
  type TouchSpec,
} from '@lieutenant-fizz/engine/touch-layout';
import type { ReplayAttempt } from './replayer';

/** One touch, from the finger going down to it lifting. Positions are in the recorded window's CSS pixels. */
export interface Touch {
  id: number;
  /** It landed on nothing, or on something that is not a control. */
  miss: boolean;
  /** The control it landed on (`dpad`, `jump`, `pogo`, `fire`, `pause`), or null for a miss. */
  control: string | null;
  /** The recorded tick it went down on. */
  down: number;
  /** The tick it lifted or was cancelled on, or null when the log ended with it down. */
  up: number | null;
  path: { x: number; y: number; t: number }[];
}

/**
 * The touches that happened in play during an attempt. A touch on a menu, a card or the pause screen is left
 * out, since the replay shows the level. A touch is a hit when the recorder named a control under it, and a miss
 * otherwise.
 */
export function touchesOf(events: readonly SessionEvent[], attempt: ReplayAttempt): Touch[] {
  const out: Touch[] = [];
  const open = new Map<number, Touch>();
  // A level starts on the play screen.
  let playing = true;
  for (let i = attempt.index; i < attempt.end; i++) {
    const e = events[i]!;
    if (e.e === 'screen') {
      playing = e['to'] === 'play';
      continue;
    }
    if (e.e !== 'ptr') continue;
    const id = num(e, 'id');
    const x = num(e, 'x');
    const y = num(e, 'y');
    if (e['k'] === 'down') {
      if (!playing) continue;
      const on = typeof e['on'] === 'string' ? e['on'] : '';
      const control = on.startsWith('ctl:') ? on.slice(4) : null;
      const touch: Touch = {
        id,
        miss: control === null,
        control,
        down: e.t,
        up: null,
        path: [{ x, y, t: e.t }],
      };
      open.set(id, touch);
      out.push(touch);
      continue;
    }
    const touch = open.get(id);
    if (!touch) continue;
    touch.path.push({ x, y, t: e.t });
    if (e['k'] === 'up' || e['k'] === 'cancel') {
      touch.up = e.t;
      open.delete(id);
    }
  }
  return out;
}

/** How many ticks of a finger's trail are drawn, and how long a lifted finger lingers. */
export const TRAIL_TICKS = 20;
export const LINGER_TICKS = 30;

/** The fingers to draw at a tick: those down, and those that lifted a moment ago, fading. */
export function fingersAt(
  touches: readonly Touch[],
  tick: number,
  trail = TRAIL_TICKS,
  linger = LINGER_TICKS,
): Finger[] {
  const out: Finger[] = [];
  for (const t of touches) {
    if (t.down > tick) continue;
    const gone = t.up !== null && t.up < tick ? tick - t.up : 0;
    if (gone > linger) continue;
    let last = t.path[0]!;
    for (const p of t.path) {
      if (p.t > tick) break;
      last = p;
    }
    out.push({
      x: last.x,
      y: last.y,
      miss: t.miss,
      down: t.up === null || tick <= t.up,
      fade: gone === 0 ? 1 : 1 - gone / linger,
      trail: t.path.filter((p) => p.t <= tick && p.t >= tick - trail),
    });
  }
  return out;
}

/** The touch controls as they were at a tick, drawn in the recorded window's pixels. */
export interface TouchLayoutAt {
  w: number;
  h: number;
  placed: PlacedControls;
  /** True when the log wrote the layout down; false when it is worked out from the specs and the window. */
  exact: boolean;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Where the touch controls were at a tick. A sample of revision 2 or later wrote the layout down in `touch`
 * events. An older one has it worked out from the window (the last `rs`) and the Size and hand in the specs,
 * with the default places: the safe-area insets, the lift when the browser's bars are gone and any moved
 * control are not in the log, so the controls may sit a little differently from how they did.
 */
export function layoutAt(session: Session, tick: number): TouchLayoutAt | null {
  let written: SessionEvent | null = null;
  let window: SessionEvent | null = null;
  for (const e of session.events) {
    if (e.t > tick) break;
    if (e.e === 'touch') written = e;
    else if (e.e === 'rs') window = e;
  }
  if (written) {
    const w = num(written, 'w');
    const h = num(written, 'h');
    const insets = written['insets'] as Insets | undefined;
    const spec = written['spec'] as TouchSpec | undefined;
    if (w > 0 && h > 0 && insets && spec) {
      return { w, h, placed: placeControls(w, h, insets, spec), exact: true };
    }
  }
  if (!window) return null;
  const w = num(window, 'w');
  const h = num(window, 'h');
  if (w <= 0 || h <= 0) return null;
  const size = session.specs['size'];
  const settings = {
    ...DEFAULT_TOUCH_SETTINGS,
    size: (SIZES as readonly unknown[]).includes(size) ? (size as TouchSize) : 'M',
    leftHanded: session.specs['leftHanded'] === true,
    pos: {},
  };
  // The apps run without the browser's bars, so the controls are lifted as they are there.
  const chromeless = String(session.specs['host'] ?? '').startsWith('tauri');
  return {
    w,
    h,
    placed: placeControls(w, h, NO_INSETS, touchSpec(settings, undefined, chromeless)),
    exact: false,
  };
}
