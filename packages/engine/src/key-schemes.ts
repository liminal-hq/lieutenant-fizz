// The keyboard schemes a player can pick in Options › Controls. The WASD scheme also takes the mouse.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * One way to play with a keyboard. Every scheme moves with the arrow keys or WASD; a scheme chooses the
 * keys (and mouse buttons) for the three actions. Keys are physical positions (`KeyboardEvent.code`), so a scheme
 * keeps its shape on AZERTY and other layouts; {@link codeLabel} names a key for the layout the player has.
 */
export interface KeyScheme {
  /** The number saved for this scheme. It never changes, so a saved choice keeps its meaning; see {@link RETIRED_SCHEMES}. */
  readonly id: number;
  /** The name shown in Options. */
  readonly name: string;
  /** One line on who it suits, for the Controls screen. */
  readonly note: string;
  readonly jump: readonly string[];
  readonly pogo: readonly string[];
  readonly fire: readonly string[];
  /** Mouse buttons that work an action as well as its keys (0 is the left button, 2 the right). */
  readonly mouse?: { readonly jump?: number; readonly pogo?: number; readonly fire?: number };
  /** The movement keys this scheme tells the player about. All of {@link MOVE_KEYS} work whichever it is. */
  readonly move: readonly string[];
}

/** The keys that move Ben in every scheme: `[left, right, up, down]`, each as an arrow and a WASD key. */
export const MOVE_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
} as const;

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;
const WASD = ['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const;

/**
 * The schemes, in the order Options steps through them. A saved choice is a scheme's `id`, not its place in this
 * list, so Keen-style (0) and Modern (1) keep the numbers the old layouts had.
 */
export const KEY_SCHEMES: readonly KeyScheme[] = [
  {
    id: 0,
    name: 'Keen-style',
    note: 'As in Commander Keen. Ctrl and Alt are shortcuts in some browsers and desktops, so Modern is safer.',
    jump: ['ControlLeft', 'ControlRight'],
    pogo: ['AltLeft', 'AltRight'],
    fire: ['Space'],
    move: ARROWS,
  },
  {
    id: 1,
    name: 'Modern',
    note: 'Arrow keys and three keys under the left hand, with Space as a second Fizz key. No modifier keys.',
    jump: ['KeyZ'],
    pogo: ['KeyX'],
    fire: ['KeyC', 'Space'],
    move: ARROWS,
  },
  {
    id: 2,
    name: 'WASD',
    note: 'Left hand moves, Space jumps with the thumb, and J and K are under the right hand. The left mouse button also fires and the right one works the pogo.',
    jump: ['Space'],
    pogo: ['KeyK'],
    fire: ['KeyJ'],
    mouse: { fire: 0, pogo: 2 },
    move: WASD,
  },
  {
    id: 4,
    name: 'Left hand',
    note: 'Everything under the left hand: WASD, Space with the thumb, Q and E.',
    jump: ['Space'],
    pogo: ['KeyQ'],
    fire: ['KeyE'],
    move: WASD,
  },
  {
    id: 5,
    name: 'Right hand',
    note: 'Everything under the right hand: the arrow keys and the three keys beside them, comma, period and slash.',
    jump: ['Comma'],
    pogo: ['Period'],
    fire: ['Slash'],
    move: ARROWS,
  },
];

/** The scheme a player gets until they pick another (an `id`). */
export const DEFAULT_KEY_SCHEME = 1;

/**
 * Schemes that no longer exist, and the one each plays as. Number 3 was a separate Mouse scheme; the mouse belongs
 * to WASD now, so a saved 3 is WASD.
 */
export const RETIRED_SCHEMES: Readonly<Record<number, number>> = { 3: 2 };

/** The scheme saved as `id` (a retired one as what replaced it), or the default for a number that is not one. */
export function keyScheme(id: number): KeyScheme {
  const now = RETIRED_SCHEMES[id] ?? id;
  return (
    KEY_SCHEMES.find((s) => s.id === now) ?? KEY_SCHEMES.find((s) => s.id === DEFAULT_KEY_SCHEME)!
  );
}

/** What a saved value means as a scheme `id`: a whole number that names a scheme, or one that did and is retired, else the default. */
export function normaliseScheme(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_KEY_SCHEME;
  const now = RETIRED_SCHEMES[value] ?? value;
  return KEY_SCHEMES.some((s) => s.id === now) ? now : DEFAULT_KEY_SCHEME;
}

/** The scheme `delta` places from `id` in the order Options shows, wrapping round. */
export function stepScheme(id: number, delta: number): number {
  const n = KEY_SCHEMES.length;
  const at = KEY_SCHEMES.findIndex((s) => s.id === keyScheme(id).id);
  return KEY_SCHEMES[(((at + delta) % n) + n) % n]!.id;
}

/** Every key code a scheme acts on, for the ones the page should keep from the browser (Space scrolls, Slash opens quick find). */
export function schemeCodes(s: KeyScheme): string[] {
  return [...Object.values(MOVE_KEYS).flat(), ...s.jump, ...s.pogo, ...s.fire];
}

/** Whether the scheme uses the mouse. */
export const usesMouse = (s: KeyScheme): boolean => !!s.mouse;

/**
 * A key's name for the player's own keyboard. `map` is the browser's layout map (code to the character that key
 * types), where it has one; without it, or for a key it does not hold, the name comes from the code as a US
 * keyboard reads. The arrows and the named keys have names of their own.
 */
export function codeLabel(code: string, map?: ReadonlyMap<string, string> | null): string {
  const typed = map?.get(code);
  if (typed && typed.length === 1) return typed.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'Space';
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    default:
      return code;
  }
}

/** The mouse button an action uses in a scheme, or undefined. */
export const mouseButton = (s: KeyScheme, action: 'jump' | 'pogo' | 'fire'): number | undefined =>
  s.mouse?.[action];
