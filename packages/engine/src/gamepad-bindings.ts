// The player's gamepad button bindings: which buttons do Jump, Pogo, Fizz and Pause, stored on this device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure, with no DOM: parsing, saving, conflict handling and turning held buttons into actions are
// unit-tested. Buttons are standard-mapping indices. The D-pad (12 to 15) and the sticks stay fixed and
// are not bindable. The bindings belong to the device and every episode shares them, so they live in the
// engine, like the touch settings.

/** The actions a gamepad button can be bound to. */
export const PAD_ACTIONS = ['jump', 'pogo', 'fire', 'pause'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];

/** The name of each action as the screens show it. */
export const PAD_ACTION_NAMES: Readonly<Record<PadAction, string>> = {
  jump: 'Jump',
  pogo: 'Pogo',
  fire: 'Fizz',
  pause: 'Pause',
};

/**
 * The buttons that can be bound, by standard-mapping index: the face buttons (0 to 3), the shoulders and
 * triggers (4 to 7), Select (8) and Start (9). The D-pad and the stick clicks are left out.
 */
export const BINDABLE_BUTTONS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Storage key for the bindings; the version lives inside the saved JSON. */
export const PAD_BINDINGS_KEY = 'lf-pad-bindings-v1';

/** Each action's buttons. An action can have several (Pogo is B and Y by default), and a button can serve several actions when the player shares it. */
export type PadBindings = Readonly<Record<PadAction, readonly number[]>>;

/** The standard mapping as the game has always read it: A jumps, B and Y pogo, X and RT fire, Start pauses. */
export const DEFAULT_PAD_BINDINGS: PadBindings = {
  jump: [0],
  pogo: [1, 3],
  fire: [2, 7],
  pause: [9],
};

const defaults = (): PadBindings => ({
  jump: [...DEFAULT_PAD_BINDINGS.jump],
  pogo: [...DEFAULT_PAD_BINDINGS.pogo],
  fire: [...DEFAULT_PAD_BINDINGS.fire],
  pause: [...DEFAULT_PAD_BINDINGS.pause],
});

const bindable = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && BINDABLE_BUTTONS.includes(v);

/** A stored list of buttons, or null when it is not a non-empty list of bindable buttons (duplicates are dropped). */
function buttons(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every(bindable)) return null;
  return [...new Set(v as number[])];
}

/**
 * Parses stored bindings. An action whose entry is missing or invalid takes its default; an unknown
 * version gives every default. Two actions may hold the same button (a button can be shared).
 */
export function parsePadBindings(json: string | null): PadBindings {
  try {
    const raw = (json ? JSON.parse(json) : null) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return defaults();
    const d = DEFAULT_PAD_BINDINGS;
    const out = {} as Record<PadAction, readonly number[]>;
    for (const a of PAD_ACTIONS) out[a] = buttons(raw[a]) ?? [...d[a]];
    return out;
  } catch {
    return defaults();
  }
}

/** The JSON to store: the version and the four actions. */
export function serialisePadBindings(b: PadBindings): string {
  return JSON.stringify({ v: 1, jump: b.jump, pogo: b.pogo, fire: b.fire, pause: b.pause });
}

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

/** Reads the bindings from storage; a missing, unreadable or invalid entry gives the defaults. Never writes. */
export function readPadBindings(store: Reader | null): PadBindings {
  try {
    return parsePadBindings(store?.getItem(PAD_BINDINGS_KEY) ?? null);
  } catch {
    return defaults();
  }
}

/** Saves the bindings; false when there is no storage or it refuses (the bindings still apply this session). */
export function writePadBindings(store: Writer | null, b: PadBindings): boolean {
  try {
    store?.setItem(PAD_BINDINGS_KEY, serialisePadBindings(b));
    return !!store;
  } catch {
    return false;
  }
}

/** Every action back on its default buttons. */
export const resetPadBindings = (): PadBindings => defaults();

/** Whether the bindings are the defaults. */
export const isDefaultPadBindings = (b: PadBindings): boolean =>
  PAD_ACTIONS.every(
    (a) =>
      b[a].length === DEFAULT_PAD_BINDINGS[a].length &&
      b[a].every((i, k) => i === DEFAULT_PAD_BINDINGS[a][k]),
  );

/** What setting an action's buttons did to the others. */
export interface BindResult {
  bindings: PadBindings;
  /** The actions that lost one or more of the buttons (they keep their other buttons). */
  lost: PadAction[];
  /** The actions that would have been left with nothing, and so keep the buttons: the buttons are shared. */
  shared: PadAction[];
}

/**
 * Gives an action exactly these buttons, replacing what it had. Another action that held any of them loses
 * those and keeps the rest; if that would leave it with nothing it keeps them too, so the button is shared
 * and no action is ever empty. Buttons that cannot be bound are dropped and duplicates collapse; with none
 * left nothing changes.
 */
export function setButtons(
  b: PadBindings,
  action: PadAction,
  wanted: readonly number[],
): BindResult {
  const next = [...new Set(wanted.filter(bindable))];
  if (next.length === 0) return { bindings: b, lost: [], shared: [] };
  const out = { ...b } as Record<PadAction, readonly number[]>;
  out[action] = next;
  const lost: PadAction[] = [];
  const shared: PadAction[] = [];
  for (const other of PAD_ACTIONS) {
    if (other === action || !b[other].some((i) => next.includes(i))) continue;
    const left = b[other].filter((i) => !next.includes(i));
    if (left.length === 0) shared.push(other);
    else {
      out[other] = left;
      lost.push(other);
    }
  }
  return { bindings: out, lost, shared };
}

/** Binds one button to an action, replacing its buttons: `setButtons` with a single button. */
export const bindButton = (b: PadBindings, action: PadAction, button: number): BindResult =>
  setButtons(b, action, [button]);

/** The actions whose buttons are held on a pad. */
export interface PadActions {
  jump: boolean;
  pogo: boolean;
  fire: boolean;
  pause: boolean;
}

/** Which actions are held, given the pad's buttons and the bindings. */
export function buttonsToBits(bindings: PadBindings, pad: Pick<Gamepad, 'buttons'>): PadActions {
  const held = (a: PadAction): boolean => bindings[a].some((i) => !!pad.buttons[i]?.pressed);
  return { jump: held('jump'), pogo: held('pogo'), fire: held('fire'), pause: held('pause') };
}
