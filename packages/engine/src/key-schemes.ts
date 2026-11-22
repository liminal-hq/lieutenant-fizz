// The keyboard (and mouse) schemes a player can pick in Options › Controls.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * One way to play with a keyboard. Every scheme moves with the arrow keys or WASD; a scheme chooses the
 * keys (and mouse buttons) for the three actions. Keys are physical positions (`KeyboardEvent.code`), so a scheme
 * keeps its shape on AZERTY and other layouts; {@link codeLabel} names a key for the layout the player has.
 */
export interface KeyScheme {
  /** The name shown in Options. */
  readonly name: string;
  /** One line on who it suits, for the Controls screen. */
  readonly note: string;
  readonly jump: readonly string[];
  readonly pogo: readonly string[];
  readonly fire: readonly string[];
  /** Mouse buttons that stand in for an action (0 is the left button, 2 the right). */
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
 * The schemes, in the order Options steps through them. A saved choice is an index, so the first two keep the
 * places the old Keen-style and Modern layouts had and new ones go on the end.
 */
export const KEY_SCHEMES: readonly KeyScheme[] = [
  {
    name: 'Keen-style',
    note: 'As in Commander Keen. Ctrl and Alt are shortcuts in some browsers and desktops, so Modern is safer.',
    jump: ['ControlLeft', 'ControlRight'],
    pogo: ['AltLeft', 'AltRight'],
    fire: ['Space'],
    move: ARROWS,
  },
  {
    name: 'Modern',
    note: 'Arrow keys and three keys under the left hand. No modifier keys.',
    jump: ['KeyZ'],
    pogo: ['KeyX'],
    fire: ['KeyC'],
    move: ARROWS,
  },
  {
    name: 'WASD',
    note: 'Left hand moves, Space jumps with the thumb, and J and K are under the right hand.',
    jump: ['Space'],
    pogo: ['KeyK'],
    fire: ['KeyJ'],
    move: WASD,
  },
  {
    name: 'Mouse',
    note: 'WASD and Space, with the left mouse button for Fizz and the right for the pogo.',
    jump: ['Space'],
    pogo: [],
    fire: [],
    mouse: { fire: 0, pogo: 2 },
    move: WASD,
  },
  {
    name: 'Left hand',
    note: 'Everything under the left hand: WASD, Space with the thumb, Q and E.',
    jump: ['Space'],
    pogo: ['KeyQ'],
    fire: ['KeyE'],
    move: WASD,
  },
  {
    name: 'Right hand',
    note: 'Everything under the right hand: the arrow keys and the three keys beside them, comma, period and slash.',
    jump: ['Comma'],
    pogo: ['Period'],
    fire: ['Slash'],
    move: ARROWS,
  },
];

/** The scheme a player gets until they pick another. */
export const DEFAULT_KEY_SCHEME = 1;

/** The scheme at an index, or the default for an index that is not one. */
export function keyScheme(index: number): KeyScheme {
  return KEY_SCHEMES[index] ?? KEY_SCHEMES[DEFAULT_KEY_SCHEME]!;
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
