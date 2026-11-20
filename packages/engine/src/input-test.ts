// The model behind the Input test page: raw device events as log lines and lit states, action names, hold-to-leave, sampling counters and the mapping report.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure, with the time and the device state passed in, so it is unit-tested without a browser. Every "what
// action does this produce" answer comes from the functions the game itself uses (`keysToBits`, `padToBits`,
// `keyCommand`, `pauseKeyKind`, `TouchState`), so the page and the game cannot disagree. The page only draws it.

import { DEFAULT_PAD_BINDINGS, type PadBindings } from './gamepad-bindings';
import { padButtonName, type PadFamily } from './gamepad-labels';
import {
  Input,
  isFullscreenKey,
  keyCommand,
  keysToBits,
  padToBits,
  pauseKeyKind,
  touchToBits,
} from './input';
import { DEFAULT_KEY_SCHEME, KEY_SCHEMES, keyScheme, type KeyScheme } from './key-schemes';
import { dpadDirections, hitTest, TouchState, type ControlId, type TouchLayout } from './touch';

/** The device a panel of the page is for. */
export type TestDevice = 'gamepad' | 'keyboard' | 'touch' | 'mouse';

/** The input word's bits by name, in the order the strip shows them. Fire is called Fizz, as everywhere in the game. */
export const WORD: readonly { name: string; bit: number }[] = [
  { name: 'Left', bit: Input.LEFT },
  { name: 'Right', bit: Input.RIGHT },
  { name: 'Up', bit: Input.UP },
  { name: 'Down', bit: Input.DOWN },
  { name: 'Jump', bit: Input.JUMP },
  { name: 'Pogo', bit: Input.POGO },
  { name: 'Fizz', bit: Input.FIRE },
  { name: 'Confirm', bit: Input.CONFIRM },
];

/** Pause is a command, not a bit, so the strip lists it after the bits. */
export const PAUSE_NAME = 'Pause';

/** Every name the strip shows, in order. */
export const STRIP_NAMES: readonly string[] = [...WORD.map((w) => w.name), PAUSE_NAME];

/** The names of the bits set in a word. */
export function bitNames(bits: number): string[] {
  return WORD.filter((w) => (bits & w.bit) !== 0).map((w) => w.name);
}

/** The text of an action list: the names joined by " + ", or "no action". */
export const actionText = (actions: readonly string[]): string =>
  actions.length ? actions.join(' + ') : 'no action';

// ---------- Keyboard ----------

/**
 * What a key does, as the names the input word and the commands carry: the bits `keysToBits` sets in the key
 * scheme chosen in Options › Controls, Confirm for Enter, Pause for Esc, P and the Pause key, and the commands the
 * input manager raises for the rest.
 */
export function keyActions(code: string, key = '', layout = DEFAULT_KEY_SCHEME): string[] {
  const out = bitNames(keysToBits(new Set([code]), keyScheme(layout)));
  if (code === 'Enter') out.push('Confirm');
  if (pauseKeyKind({ code, key, repeat: false })) out.push(PAUSE_NAME);
  if (isFullscreenKey({ code, repeat: false, ctrlKey: false, altKey: false, metaKey: false }))
    out.push('Fullscreen');
  const c = keyCommand(code);
  if (c && c.type !== 'confirm') {
    out.push(
      c.type === 'quickSave'
        ? 'Quick save'
        : c.type === 'quickLoad'
          ? 'Quick load'
          : c.type === 'togglePanel'
            ? 'Debug panel'
            : c.type === 'zoom'
              ? c.factor > 1
                ? 'Zoom in'
                : 'Zoom out'
              : 'Zoom reset',
    );
  }
  return out;
}

/** A note for an action key of another scheme, which does nothing in the chosen one ("Not in Modern"), else empty. */
export function layoutNote(code: string, layout: number): string {
  const mine = keyScheme(layout);
  const actionKeys = (s: KeyScheme): readonly string[] => [...s.jump, ...s.pogo, ...s.fire];
  if (actionKeys(mine).includes(code)) return '';
  return KEY_SCHEMES.some((s) => actionKeys(s).includes(code)) ? `Not in ${mine.name}` : '';
}

/** A short name for a key on the picture and in readouts: "Space", "Ctrl L", "Z", "Up". The code is always shown too. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const side = /(Left|Right)$/.exec(code);
  if (side && /^(Control|Shift|Alt|Meta)/.test(code))
    return `${code.replace(/(Left|Right)$/, '').replace('Control', 'Ctrl')} ${side[1]?.[0]}`;
  return code;
}

// ---------- Gamepad ----------

/** What the page keeps of a pad each time it is read. */
export interface PadSnap {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  timestamp: number;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

/** A pad as a snapshot. */
export function snapPad(gp: Gamepad): PadSnap {
  return {
    index: gp.index,
    id: gp.id,
    mapping: gp.mapping,
    connected: gp.connected,
    timestamp: gp.timestamp,
    buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...gp.axes],
  };
}

/** Whether a pad uses the standard mapping, the one the game's button numbers assume. */
export const isStandard = (p: Pick<PadSnap, 'mapping'>): boolean => p.mapping === 'standard';

const STANDARD_BUTTONS: readonly string[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Select',
  'Start',
  'Left stick click',
  'Right stick click',
  'D-pad up',
  'D-pad down',
  'D-pad left',
  'D-pad right',
  'Home',
];

/** A button's name: on a standard pad the controller's own name (A, Cross), "D-pad up" and so on; else just its number. */
export function buttonLabel(index: number, standard: boolean, family: PadFamily): string {
  if (!standard) return `button ${index}`;
  if (index < 10) return padButtonName(index, family);
  return STANDARD_BUTTONS[index] ?? `button ${index}`;
}

const STANDARD_AXES = ['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'];

/** An axis's name: "Left stick X" on a standard pad, else its number. */
export const axisLabel = (index: number, standard: boolean): string =>
  (standard ? STANDARD_AXES[index] : undefined) ?? `axis ${index}`;

type PadLike = Pick<Gamepad, 'buttons' | 'axes'>;

const pressedButtons = (n: number, held: readonly number[]): GamepadButton[] =>
  Array.from({ length: n }, (_, i) => {
    const on = held.includes(i);
    return { pressed: on, touched: on, value: on ? 1 : 0 };
  });

/** The actions of the game's own pad reading when only this button is down: `padToBits` on a pad with just that button. */
export function padButtonActions(index: number, bindings: PadBindings): string[] {
  const pad: PadLike = { buttons: pressedButtons(index + 1, [index]), axes: [] };
  const r = padToBits(pad, bindings);
  return [...bitNames(r.bits), ...(r.start ? [PAUSE_NAME] : [])];
}

/** The action bits one button gives on its own (0 for a button with no bit, such as Pause or an unbound one). */
export function padButtonBits(index: number, bindings: PadBindings): number {
  const pad: PadLike = { buttons: pressedButtons(index + 1, [index]), axes: [] };
  return padToBits(pad, bindings).bits;
}

/**
 * Which of a pad's buttons the game's tick path reported, given the pad's share of the bits the tick returned.
 * A button that gives an action bit counts when that bit is in the word; a button with no bit (Pause, an
 * unbound one) is only ever seen by the raw read.
 */
export function gameSeen(
  p: Pick<PadSnap, 'buttons'>,
  tickPadBits: number,
  b: PadBindings,
): boolean[] {
  return p.buttons.map((btn, i) => {
    const m = padButtonBits(i, b);
    return m ? (tickPadBits & m) !== 0 : btn.pressed;
  });
}

/** The actions when this axis alone is at `value`. */
export function padAxisActions(index: number, value: number): string[] {
  const axes = Array.from({ length: index + 1 }, (_, i) => (i === index ? value : 0));
  return bitNames(padToBits({ buttons: [], axes }, DEFAULT_PAD_BINDINGS).bits);
}

/** The side of an axis's action threshold a value is on: -1, 0 or 1. It mirrors `padToBits` (0.4 on X, 0.5 on Y); any other axis uses 0.5. */
export function axisZone(index: number, value: number): -1 | 0 | 1 {
  const t = index === 0 ? 0.4 : 0.5;
  return value < -t ? -1 : value > t ? 1 : 0;
}

/** What the game does with a button under a set of bindings, in words ("Jump", "Pause", "no action"). */
export const padButtonText = (index: number, bindings: PadBindings): string =>
  actionText(padButtonActions(index, bindings));

/** The default and current action of a button, for the mapping report ("Jump" or "Jump (default no action)"). */
export function remapText(index: number, bindings: PadBindings): string {
  const now = padButtonText(index, bindings);
  const def = padButtonText(index, DEFAULT_PAD_BINDINGS);
  return now === def ? now : `${now} (default ${def})`;
}

/** A raw device event, before it is turned into a log line. */
export type RawEvent =
  | { kind: 'key'; code: string; key: string; down: boolean }
  | { kind: 'padButton'; pad: number; index: number; down: boolean }
  | { kind: 'padAxis'; pad: number; index: number; value: number }
  | { kind: 'padConnect'; pad: number; id: string; connected: boolean }
  | {
      kind: 'touch';
      id: number;
      phase: 'down' | 'up';
      x: number;
      y: number;
      control: ControlId | null;
      actions: string[];
    }
  | { kind: 'mouse'; button: number; down: boolean; x: number; y: number }
  | { kind: 'wheel'; dir: 'up' | 'down' | 'left' | 'right' };

/** What the log needs to know to name an event. */
export interface DescribeContext {
  bindings: PadBindings;
  /** The family and mapping of a pad by index. */
  pad(index: number): { family: PadFamily; standard: boolean };
  /** Options › Controls: 0 Keen-style, 1 Modern. */
  layout: number;
}

/** The mouse's buttons by `MouseEvent.button`. */
export const mouseButtonName = (b: number): string =>
  ['Left', 'Middle', 'Right', 'Back', 'Forward'][b] ?? `button ${b}`;

/** The device an event comes from. */
export function eventDevice(e: RawEvent): TestDevice {
  switch (e.kind) {
    case 'key':
      return 'keyboard';
    case 'touch':
      return 'touch';
    case 'mouse':
    case 'wheel':
      return 'mouse';
    default:
      return 'gamepad';
  }
}

/** The actions an event produces. */
export function eventActions(e: RawEvent, ctx: DescribeContext): string[] {
  switch (e.kind) {
    case 'key':
      return keyActions(e.code, e.key, ctx.layout);
    case 'padButton':
      return padButtonActions(e.index, ctx.bindings);
    case 'padAxis':
      return padAxisActions(e.index, e.value);
    case 'touch':
      return e.actions;
    case 'wheel':
      return e.dir === 'up' ? ['Zoom in'] : e.dir === 'down' ? ['Zoom out'] : [];
    default:
      return [];
  }
}

/** The elapsed time as a log stamp: "+  0:03.2" (minutes, seconds, tenths). */
export function stamp(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `+ ${String(m).padStart(2, ' ')}:${String(s).padStart(2, '0')}.${t % 10}`;
}

/**
 * One event as a log line, such as `+  0:03.2  Pad 0  button 0 (A)  down  -> Jump`. Where a key belongs only
 * to the layout not chosen, the action carries a note ("Jump (Modern key)").
 */
export function logLine(ms: number, e: RawEvent, ctx: DescribeContext): string {
  const actions = eventActions(e, ctx);
  const note = e.kind === 'key' ? layoutNote(e.code, ctx.layout) : '';
  const result = `-> ${actionText(actions)}${note ? ` (${note})` : ''}`;
  const at = stamp(ms);
  switch (e.kind) {
    case 'key':
      return `${at}  Key  ${e.code}  ${e.down ? 'down' : 'up'}  ${result}`;
    case 'padButton': {
      const p = ctx.pad(e.pad);
      return `${at}  Pad ${e.pad}  button ${e.index}${p.standard ? ` (${buttonLabel(e.index, true, p.family)})` : ''}  ${e.down ? 'down' : 'up'}  ${result}`;
    }
    case 'padAxis': {
      const p = ctx.pad(e.pad);
      return `${at}  Pad ${e.pad}  axis ${e.index}${p.standard ? ` (${axisLabel(e.index, true)})` : ''}  ${e.value.toFixed(2)}  ${result}`;
    }
    case 'padConnect':
      return `${at}  Pad ${e.pad}  ${e.connected ? 'connected' : 'disconnected'}  ${e.id}`;
    case 'touch':
      return `${at}  Touch ${e.id}  ${e.phase}  at ${Math.round(e.x)},${Math.round(e.y)}  on ${e.control ?? 'nothing'}  ${result}`;
    case 'mouse':
      return `${at}  Mouse  button ${e.button} (${mouseButtonName(e.button)})  ${e.down ? 'down' : 'up'}  at ${Math.round(e.x)},${Math.round(e.y)}  ${result}`;
    case 'wheel':
      return `${at}  Mouse  wheel ${e.dir}  ${result}`;
  }
}

/** A list that keeps only its last `cap` items, oldest first. */
export class Ring<T> {
  private readonly list: T[] = [];
  constructor(readonly cap = 12) {}
  push(item: T): void {
    this.list.push(item);
    if (this.list.length > this.cap) this.list.splice(0, this.list.length - this.cap);
  }
  /** The items, oldest first (the most recent last). */
  get items(): readonly T[] {
    return this.list;
  }
  clear(): void {
    this.list.length = 0;
  }
}

/** How long a released key or button keeps fading, in milliseconds. */
export const FADE_MS = 450;

/** Held and recently released ids, for lighting keys and buttons: held is 1, and a release fades to 0. */
export class LitTracker {
  private readonly down = new Set<string>();
  private readonly released = new Map<string, number>();

  press(id: string): void {
    this.down.add(id);
    this.released.delete(id);
  }
  release(id: string, now: number): void {
    if (this.down.delete(id)) this.released.set(id, now);
  }
  clear(): void {
    this.down.clear();
    this.released.clear();
  }
  /** The ids held now. */
  get held(): ReadonlySet<string> {
    return this.down;
  }
  /** 1 while held, then falling to 0 over {@link FADE_MS} after release. With reduced motion there is no fade: 1 or 0. */
  level(id: string, now: number, reduced = false): number {
    if (this.down.has(id)) return 1;
    const at = this.released.get(id);
    if (at === undefined || reduced) return 0;
    const l = 1 - (now - at) / FADE_MS;
    if (l <= 0) {
      this.released.delete(id);
      return 0;
    }
    return l;
  }
}

/** How long a button must be held to leave the page, in milliseconds. */
export const LEAVE_HOLD_MS = 1000;

/** A hold that leaves the page: progress while held, and `leave` once when it reaches {@link LEAVE_HOLD_MS}. A shorter press never leaves. */
export class HoldToLeave {
  private since: number | null = null;
  private fired = false;

  update(now: number, held: boolean): { progress: number; leave: boolean } {
    if (!held) {
      this.since = null;
      this.fired = false;
      return { progress: 0, leave: false };
    }
    this.since ??= now;
    const progress = Math.min(1, (now - this.since) / LEAVE_HOLD_MS);
    if (progress >= 1 && !this.fired) {
      this.fired = true;
      return { progress, leave: true };
    }
    return { progress, leave: false };
  }

  reset(): void {
    this.since = null;
    this.fired = false;
  }
}

/** The buttons that count as Back for the hold: the ones bound to Pogo, which menus read as Back. */
export const backButtons = (b: PadBindings): readonly number[] => b.pogo;

/** Whether any of the Back buttons is down on a pad. */
export const backHeld = (p: Pick<PadSnap, 'buttons'>, b: PadBindings): boolean =>
  backButtons(b).some((i) => !!p.buttons[i]?.pressed);

/** Turns pad snapshots into raw events by comparing each with the last: button edges, axes crossing a threshold, pads coming and going. */
export class PadTracker {
  private last = new Map<number, PadSnap>();
  /** The pad that last had a button or axis move, or -1. */
  lastMoved = -1;

  update(snaps: readonly (PadSnap | null)[]): RawEvent[] {
    const out: RawEvent[] = [];
    const now = new Map<number, PadSnap>();
    for (const s of snaps) if (s?.connected) now.set(s.index, s);
    for (const [i, s] of now) {
      const before = this.last.get(i);
      if (!before) out.push({ kind: 'padConnect', pad: i, id: s.id, connected: true });
      s.buttons.forEach((b, n) => {
        const was = before?.buttons[n]?.pressed ?? false;
        if (b.pressed !== was) {
          out.push({ kind: 'padButton', pad: i, index: n, down: b.pressed });
          this.lastMoved = i;
        }
      });
      s.axes.forEach((v, n) => {
        const was = before?.axes[n] ?? 0;
        if (axisZone(n, v) !== axisZone(n, was)) {
          out.push({ kind: 'padAxis', pad: i, index: n, value: v });
          this.lastMoved = i;
        }
      });
    }
    for (const [i, s] of this.last) {
      if (!now.has(i)) out.push({ kind: 'padConnect', pad: i, id: s.id, connected: false });
    }
    this.last = now;
    return out;
  }
}

/** The raw buttons and axes of a pad, each with its current value and the action it gives, for the generic panel and the report. */
export interface PadRows {
  buttons: { index: number; label: string; value: number; pressed: boolean; action: string }[];
  axes: { index: number; label: string; value: number; action: string }[];
}

/** Every raw button and axis of a pad. A non-standard pad is listed by number alone. */
export function padRows(p: PadSnap, bindings: PadBindings, family: PadFamily): PadRows {
  const standard = isStandard(p);
  return {
    buttons: p.buttons.map((b, index) => ({
      index,
      label: buttonLabel(index, standard, family),
      value: b.value,
      pressed: b.pressed,
      action: remapText(index, bindings),
    })),
    axes: p.axes.map((value, index) => ({
      index,
      label: axisLabel(index, standard),
      value,
      action: actionText(padAxisActions(index, value >= 0 ? 1 : -1)),
    })),
  };
}

/** The line that says which pad this is: "Pad 0  Xbox Controller  connected". */
export const padLine = (p: PadSnap): string =>
  `Pad ${p.index}  ${p.id || 'unnamed pad'}  ${p.connected ? 'connected' : 'not connected'}`;

// ---------- Touch ----------

/** One finger on the touch panel. */
export interface Finger {
  id: number;
  x: number;
  y: number;
  control: ControlId | null;
  actions: string[];
}

/** The actions of a finger on a control at a position. A D-pad finger's actions follow where on the pad it is. */
export function fingerActions(
  layout: TouchLayout,
  control: ControlId | null,
  x: number,
  y: number,
): string[] {
  if (!control) return [];
  if (control === 'pause') return [PAUSE_NAME];
  if (control === 'dpad') {
    const d = layout.dpad;
    const dir = dpadDirections(x - d.cx, y - d.cy, d.r);
    return bitNames(touchToBits({ ...EMPTY_HELD, ...dir }));
  }
  return bitNames(touchToBits({ ...EMPTY_HELD, [control]: true }));
}

const EMPTY_HELD = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  pogo: false,
  fire: false,
};

/**
 * Fingers on the touch panel, run through the game's own `TouchState` with the controls' hit areas, so a
 * landed touch and a miss are decided by `hitTest` exactly as in play.
 */
export class TouchProbe {
  readonly state = new TouchState();
  private readonly fingers = new Map<number, Finger>();

  setLayout(layout: TouchLayout | null): void {
    this.state.layout = layout;
  }

  /** The fingers down now. */
  get down(): readonly Finger[] {
    return [...this.fingers.values()];
  }

  /** A finger lands; returns what it landed on. */
  press(id: number, x: number, y: number, now: number): Finger {
    const layout = this.state.layout;
    const control = layout ? hitTest(layout, x, y) : null;
    this.state.down(id, x, y, now);
    const f: Finger = {
      id,
      x,
      y,
      control,
      actions: layout ? fingerActions(layout, control, x, y) : [],
    };
    this.fingers.set(id, f);
    return f;
  }

  move(id: number, x: number, y: number): void {
    this.state.move(id, x, y);
    const f = this.fingers.get(id);
    const layout = this.state.layout;
    if (!f || !layout) return;
    f.x = x;
    f.y = y;
    if (f.control) f.actions = fingerActions(layout, f.control, x, y);
  }

  lift(id: number): Finger | undefined {
    const f = this.fingers.get(id);
    this.state.up(id);
    this.fingers.delete(id);
    return f;
  }

  cancelAll(): void {
    this.state.cancelAll();
    this.fingers.clear();
  }

  /** The touch contribution to the input word, as the game's `touchToBits` makes it. A Pause finger holds no bit. */
  bits(now: number): number {
    return touchToBits(this.state.sample(now));
  }

  /** Whether a finger is on Pause (it holds no pointer in the state, so it is tracked here). */
  get pauseHeld(): boolean {
    return this.down.some((f) => f.control === 'pause');
  }
}

// ---------- Sampling ----------

/** What the sampling probe needs of a pad each read. */
export interface PadSample {
  index: number;
  timestamp: number;
  /** What the raw read shows: which buttons are down at this moment. */
  pressed: readonly boolean[];
  /**
   * For a tick read: which buttons the game's tick path reports (with fast polling, a press let go before the
   * tick still counts). Without it the tick path is the raw read.
   */
  game?: readonly boolean[];
}

/** A pad as a sample. */
export const sampleOf = (p: PadSnap): PadSample => ({
  index: p.index,
  timestamp: p.timestamp,
  pressed: p.buttons.map((b) => b.pressed),
});

/** How far back the rate and the interval statistics look, in milliseconds. */
export const SAMPLE_WINDOW_MS = 3000;

/** Whether the browser moves `gamepad.timestamp`. */
export type TimestampState = 'zero' | 'unchanged' | 'changing';

/** The statistics of the game's per-tick read intervals, in milliseconds. */
export interface IntervalStats {
  n: number;
  min: number;
  median: number;
  max: number;
}

/** What the sampling probe knows about one pad. */
export interface SamplingReport {
  timestamp: TimestampState;
  /** How often the browser changed `timestamp` per second while it was changing, or null. */
  updateHz: number | null;
  /** The per-tick read interval over the last few seconds, or null before two reads. */
  tick: IntervalStats | null;
  /** Presses the fast timer saw. */
  fastPresses: number;
  /** Presses the game's tick path saw. */
  tickSeen: number;
  /** Presses the fast timer saw that the game's tick path never reported. With fast polling on this should be about 0. */
  missed: number;
  /** The shortest of those, in milliseconds, or null. */
  shortestMissedMs: number | null;
  /** Presses the old per-tick read alone (what is down at the moment of the tick) would have missed. */
  missedRaw: number;
  /** The shortest of those, in milliseconds, or null. */
  shortestMissedRawMs: number | null;
  /** The shortest press the fast timer saw end, missed or not, or null. */
  shortestMs: number | null;
}

interface Press {
  at: number;
  /** When the timer saw it let go, or null while it is held. */
  end: number | null;
  /** The game's tick path reported it (with fast polling, a press let go before the tick counts). */
  seen: boolean;
  /** The old per-tick read alone, which sees only what is down at the moment of the tick, would have seen it. */
  seenRaw: boolean;
}

interface PadSampling {
  stamps: number[];
  firstRead: number;
  lastTimestamp: number | null;
  everNonZero: boolean;
  open: Map<number, Press>;
  /** Presses the timer saw end, waiting for the next tick to say whether it saw them. */
  ended: { button: number; press: Press }[];
  fastPresses: number;
  tickSeen: number;
  missed: number;
  shortestMissed: number | null;
  missedRaw: number;
  shortestMissedRaw: number | null;
  shortest: number | null;
}

const fresh = (): PadSampling => ({
  stamps: [],
  firstRead: -1,
  lastTimestamp: null,
  everNonZero: false,
  open: new Map(),
  ended: [],
  fastPresses: 0,
  tickSeen: 0,
  missed: 0,
  shortestMissed: null,
  missedRaw: 0,
  shortestMissedRaw: null,
  shortest: null,
});

const minOf = (a: number | null, b: number): number => (a === null ? b : Math.min(a, b));

/**
 * Measures whether the game's per-tick read of the pad loses short presses. A fast timer reads the pad
 * (`fast`) and each tick is reported (`tick`) with what the game's tick path gave. A press the timer saw come
 * and go is judged at the next tick twice: against the game's path (which latches short presses, so it should
 * be seen) and against the raw per-tick read alone, which is what the game did before fast polling. It measures
 * only: nothing here changes how the pad is read.
 */
export class SamplingProbe {
  private pads = new Map<number, PadSampling>();
  private tickTimes: number[] = [];

  private of(i: number): PadSampling {
    let p = this.pads.get(i);
    if (!p) this.pads.set(i, (p = fresh()));
    return p;
  }

  /** A read by the fast timer at `now` (milliseconds). */
  fast(now: number, pads: readonly PadSample[]): void {
    for (const s of pads) {
      const p = this.of(s.index);
      if (p.firstRead < 0) p.firstRead = now;
      if (s.timestamp !== 0) p.everNonZero = true;
      if (p.lastTimestamp !== null && s.timestamp !== p.lastTimestamp) p.stamps.push(now);
      p.lastTimestamp = s.timestamp;
      while (p.stamps.length && now - (p.stamps[0] as number) > SAMPLE_WINDOW_MS) p.stamps.shift();
      s.pressed.forEach((on, n) => {
        const open = p.open.get(n);
        if (on && !open) {
          p.open.set(n, { at: now, end: null, seen: false, seenRaw: false });
          p.fastPresses++;
        } else if (!on && open) {
          p.open.delete(n);
          open.end = now;
          p.shortest = minOf(p.shortest, now - open.at);
          p.ended.push({ button: n, press: open });
        }
      });
    }
  }

  /**
   * A tick read at `now`: `pressed` is the raw read, and `game` (where given) what the game's tick path
   * reported for each button.
   */
  tick(now: number, pads: readonly PadSample[]): void {
    this.tickTimes.push(now);
    while (this.tickTimes.length && now - (this.tickTimes[0] as number) > SAMPLE_WINDOW_MS)
      this.tickTimes.shift();
    for (const s of pads) {
      const p = this.of(s.index);
      const game = (n: number): boolean => s.game?.[n] ?? s.pressed[n] ?? false;
      const down = new Set<number>();
      s.pressed.forEach((on, n) => {
        if (on || game(n)) down.add(n);
      });
      for (const n of down) {
        const open = p.open.get(n);
        const raw = s.pressed[n] === true;
        const g = game(n);
        if (!open) {
          // A press the timer already saw end is judged below, not counted again.
          if (p.ended.some((e) => e.button === n)) continue;
          // The tick saw a press the timer has not: the timer is behind, so the press is the tick's.
          p.open.set(n, { at: now, end: null, seen: g, seenRaw: raw });
          if (g) p.tickSeen++;
          p.fastPresses++;
          continue;
        }
        if (raw) open.seenRaw = true;
        if (g && !open.seen) {
          open.seen = true;
          p.tickSeen++;
        }
      }
      // A press that ended since the last tick is judged now: did the game's path give it a tick?
      const waiting = p.ended;
      p.ended = [];
      for (const { button, press } of waiting) {
        if (!press.seen && game(button)) {
          press.seen = true;
          p.tickSeen++;
        }
        const ms = (press.end ?? now) - press.at;
        if (!press.seen) {
          p.missed++;
          p.shortestMissed = minOf(p.shortestMissed, ms);
        }
        if (!press.seenRaw) {
          p.missedRaw++;
          p.shortestMissedRaw = minOf(p.shortestMissedRaw, ms);
        }
      }
    }
  }

  /** Zeroes the counters, keeping the pad and interval history. */
  reset(): void {
    for (const p of this.pads.values()) {
      p.fastPresses = 0;
      p.tickSeen = 0;
      p.missed = 0;
      p.shortestMissed = null;
      p.missedRaw = 0;
      p.shortestMissedRaw = null;
      p.shortest = null;
      p.open.clear();
      p.ended = [];
    }
  }

  /** Forgets everything (the page closed). */
  clear(): void {
    this.pads.clear();
    this.tickTimes = [];
  }

  report(index: number, now: number): SamplingReport {
    const p = this.of(index);
    const stamps = p.stamps.filter((t) => now - t <= SAMPLE_WINDOW_MS);
    let timestamp: TimestampState = 'changing';
    if (!p.everNonZero) timestamp = 'zero';
    else if (stamps.length === 0) timestamp = 'unchanged';
    let updateHz: number | null = null;
    if (stamps.length >= 2) {
      const span = (stamps[stamps.length - 1] as number) - (stamps[0] as number);
      if (span > 0) updateHz = ((stamps.length - 1) * 1000) / span;
    }
    const gaps: number[] = [];
    for (let i = 1; i < this.tickTimes.length; i++)
      gaps.push((this.tickTimes[i] as number) - (this.tickTimes[i - 1] as number));
    gaps.sort((a, b) => a - b);
    const tick: IntervalStats | null = gaps.length
      ? {
          n: gaps.length,
          min: gaps[0] as number,
          median: gaps[Math.floor(gaps.length / 2)] as number,
          max: gaps[gaps.length - 1] as number,
        }
      : null;
    return {
      timestamp,
      updateHz,
      tick,
      fastPresses: p.fastPresses,
      tickSeen: p.tickSeen,
      missed: p.missed,
      shortestMissedMs: p.shortestMissed,
      missedRaw: p.missedRaw,
      shortestMissedRawMs: p.shortestMissedRaw,
      shortestMs: p.shortest,
    };
  }
}

const ms1 = (v: number): string => `${v.toFixed(1)} ms`;

/** The sampling report as text lines for the page and the copied report. */
export function samplingLines(r: SamplingReport): string[] {
  const stamp =
    r.timestamp === 'zero'
      ? 'timestamp: the browser leaves it at 0'
      : r.timestamp === 'unchanged'
        ? 'timestamp: no change in 3 s (idle pad, or the browser never moves it)'
        : `timestamp: changes ${r.updateHz === null ? 'once so far' : `${r.updateHz.toFixed(0)} per second`}`;
  return [
    stamp,
    r.tick
      ? `game read interval: min ${ms1(r.tick.min)}, median ${ms1(r.tick.median)}, max ${ms1(r.tick.max)} (${r.tick.n} reads)`
      : 'game read interval: waiting for reads',
    `presses seen by the timer ${r.fastPresses}, by the game's tick path ${r.tickSeen}`,
    `presses the game never saw ${r.missed}${r.shortestMissedMs === null ? '' : `, shortest ${ms1(r.shortestMissedMs)}`}`,
    `presses the old per-tick read alone would have missed ${r.missedRaw}${r.shortestMissedRawMs === null ? '' : `, shortest ${ms1(r.shortestMissedRawMs)}`}`,
    `shortest press seen ${r.shortestMs === null ? 'none yet' : ms1(r.shortestMs)}`,
  ];
}

// ---------- Report ----------

/** The browser's name from its user agent, for the report. WebKit-based hosts say "Safari" here; the host line tells the app apart. */
export function browserOf(ua: string): string {
  const v = (re: RegExp): string => re.exec(ua)?.[1] ?? '';
  if (/Firefox\//.test(ua)) return `Firefox ${v(/Firefox\/([\d.]+)/)}`;
  if (/Edg\//.test(ua)) return `Edge ${v(/Edg\/([\d.]+)/)}`;
  if (/Chrome\//.test(ua)) return `Chrome ${v(/Chrome\/([\d.]+)/)}`;
  if (/Safari\//.test(ua)) return `Safari/WebKit ${v(/Version\/([\d.]+)/)}`.trim();
  return 'unknown browser';
}

/** What the mapping block says about where the game runs. */
export interface ReportEnv {
  host: string;
  userAgent: string;
}

/** The mapping report: where it runs, the pad's identity and every raw button and axis with its action. Plain text for an issue. */
export function mappingReport(
  env: ReportEnv,
  p: PadSnap | null,
  bindings: PadBindings,
  family: PadFamily,
  sampling: SamplingReport | null,
): string[] {
  const lines = [`Host: ${env.host}`, `Browser: ${browserOf(env.userAgent)}`];
  if (!p) return [...lines, 'Pad: none connected'];
  lines.push(
    `Pad ${p.index}: ${p.id}`,
    `Mapping: ${p.mapping ? p.mapping : '(empty, not standard)'}`,
    `Buttons: ${p.buttons.length}  Axes: ${p.axes.length}`,
    `Timestamp: ${p.timestamp === 0 ? 'present but 0' : 'present'}`,
  );
  const rows = padRows(p, bindings, family);
  lines.push(
    'Buttons (index, value, game action now):',
    ...rows.buttons.map(
      (b) => `  ${b.index}  ${b.value.toFixed(2)}${b.pressed ? ' held' : ''}  ${b.action}`,
    ),
    'Axes (index, value):',
    ...rows.axes.map((a) => `  ${a.index}  ${a.value.toFixed(2)}`),
  );
  if (sampling) lines.push('Sampling:', ...samplingLines(sampling).map((l) => `  ${l}`));
  return lines;
}

/** The text the Copy report button puts on the clipboard: the mapping report and the last 20 log lines. */
export function reportText(mapping: readonly string[], log: readonly string[]): string {
  return [...mapping, '', 'Log (last 20):', ...log.slice(-20)].join('\n');
}
