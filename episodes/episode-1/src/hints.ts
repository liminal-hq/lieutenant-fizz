// Keycap and button hints that match the player's last-used device and keyboard layout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { DEFAULT_PAD_BINDINGS } from '@lieutenant-fizz/engine/gamepad-bindings';
import {
  padActionToken,
  padActionTokens,
  padButtonToken,
  type PadLabels,
} from '@lieutenant-fizz/engine/gamepad-labels';
import type { InputDevice } from '@lieutenant-fizz/engine/input';

/** What the hints need to know: the device in use, and Options › Controls (0 Keen-style, 1 Modern). */
export interface HintContext {
  device: InputDevice;
  layout: number;
  /** The game can go fullscreen on request, so the `F` shortcut exists. */
  fullscreen?: boolean;
  /** The on-screen Fullscreen button exists: a browser page can offer it, the desktop app's native window does not. */
  fullscreenButton?: boolean;
  /**
   * The page is fullscreen with Esc locked, on a screen whose top level Esc then leaves fullscreen from
   * (the title and the pause menu): the Esc hint reads "Exit fullscreen" and replaces the `F` hint, and
   * the pause menu is resumed with P or Pause.
   */
  escExitsFullscreen?: boolean;
  /** The gamepad's bindings and the controller family to name them in. Without it the hints show the defaults on an Xbox pad. */
  pad?: PadLabels;
}

/** The screens that show a hint bar. */
export type HintScreen = 'list' | 'pause' | 'options' | 'saves' | 'controls' | 'listen';

/** The gamepad labels the hints use: the player's bindings and controller, or the standard mapping on an Xbox pad. */
const labels = (c: HintContext): PadLabels =>
  c.pad ?? { bindings: DEFAULT_PAD_BINDINGS, family: 'xbox' };

/** One action's first button as a hint token. */
const padToken = (c: HintContext, action: 'jump' | 'pogo' | 'fire' | 'pause'): string => {
  const l = labels(c);
  return padActionToken(l.bindings, action, l.family);
};

/** All of an action's buttons as hint tokens, such as `{B} {Y}`. */
const padTokens = (c: HintContext, action: 'jump' | 'pogo' | 'fire' | 'pause'): string => {
  const l = labels(c);
  return padActionTokens(l.bindings, action, l.family);
};

const pad = (c: HintContext): boolean => c.device === 'gamepad';
const touch = (c: HintContext): boolean => c.device === 'touch';

/**
 * What the on-screen controls are called outside play, on their faces and in the hints: Jump chooses
 * and Pogo goes back, as A and B do on a gamepad.
 */
export const TOUCH_LABELS = {
  dpad: 'D-pad',
  select: 'Select',
  back: 'Back',
  pause: 'Pause',
} as const;

/** An on-screen control's name as a hint token (drawn as a keycap, like a key's name). */
const touchCap = (name: string): string => `{[${name}]}`;

/** The jump control: Ctrl in the Keen-style layout, Z in the modern one, the Jump button (A by default) on a gamepad, Select on touch. */
export const jumpHint = (c: HintContext): string =>
  touch(c)
    ? touchCap(TOUCH_LABELS.select)
    : pad(c)
      ? padToken(c, 'jump')
      : c.layout === 1
        ? '{[Z]}'
        : '{Ctrl}';

/** The confirm control. On a gamepad it is the Jump button, since menus read Jump as Select. */
export const selectHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.select) : pad(c) ? padToken(c, 'jump') : '{Enter}';

/** The back control. On a gamepad it is the Pogo button, since menus read Pogo as Back. */
export const backHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.back) : pad(c) ? padToken(c, 'pogo') : '{Esc}';

/** The menu control that skips or resumes: Esc and the Pause key, the Pause button (Start by default) on a gamepad, the Pause button on touch. */
export const menuHint = (c: HintContext): string =>
  touch(c) ? touchCap(TOUCH_LABELS.pause) : pad(c) ? padToken(c, 'pause') : '{Esc} {[Pause]}';

/** The pause menu's Resume control. With Esc leaving fullscreen it is P and the Pause key instead. */
export const resumeHint = (c: HintContext): string =>
  c.escExitsFullscreen && c.device === 'keyboard' ? '{[P]} {[Pause]}' : menuHint(c);

/**
 * The touch hints: the controls' own names, which read the same as their faces, and no keys. Where
 * the name says what the control does (Select, Back) it stands alone.
 */
function touchMenuHints(screen: HintScreen): string[] {
  const choose = `${touchCap(TOUCH_LABELS.dpad)} Choose`;
  const select = touchCap(TOUCH_LABELS.select);
  const back = touchCap(TOUCH_LABELS.back);
  switch (screen) {
    case 'options':
      return [`${touchCap(TOUCH_LABELS.dpad)} Change`, back];
    case 'saves':
      return [choose, select, back];
    case 'controls':
      return [back];
    case 'listen':
      return [`${back} Cancel`];
    case 'pause':
      return [choose, select, `${touchCap(TOUCH_LABELS.pause)} Resume`];
    default:
      return [choose, select];
  }
}

/**
 * The hints along the bottom of a menu screen, one entry per hint. A keyboard also gets the fullscreen
 * shortcut where the page has one, except on the Controls screen, whose table already lists it and which
 * has no room for a third hint on a narrow window.
 */
export function menuHints(screen: HintScreen, c: HintContext): string[] {
  const hints = baseMenuHints(screen, c);
  if (c.device !== 'keyboard' || !c.fullscreen || screen === 'controls') return hints;
  // With Esc locked in fullscreen, Esc leaves it from the top of the title and the pause menu, which
  // says so in the place the `F` hint would take.
  if (c.escExitsFullscreen && (screen === 'list' || screen === 'pause'))
    return [...hints, '{Esc} Exit fullscreen'];
  return [...hints, '{[F]} Fullscreen'];
}

function baseMenuHints(screen: HintScreen, c: HintContext): string[] {
  if (touch(c)) return touchMenuHints(screen);
  const choose = '{[↑↓]} Choose';
  const select = `${selectHint(c)} Select`;
  switch (screen) {
    case 'options':
      return [choose, '{[←→]} Change', `${backHint(c)} Back`];
    case 'saves':
      return [choose, select, `${backHint(c)} Back`];
    case 'controls':
      return [`${selectHint(c)} Back`, `${backHint(c)} Back`];
    case 'listen':
      // Esc cancels from the keyboard; on a pad it is Start held for a second, whatever Pause is bound to.
      return pad(c) ? [`Hold ${padButtonToken(9, labels(c).family)} Cancel`] : ['{Esc} Cancel'];
    case 'pause':
      return [choose, select, `${resumeHint(c)} Resume`];
    default:
      return [choose, select];
  }
}

/** The hints on the credits roll. `act` is what the jump control does right now (Speed up, Continue). */
export function creditsHints(c: HintContext, act: string): string[] {
  return [`${menuHint(c)} Skip credits`, `${jumpHint(c)} ${act}`];
}

/** The hints on the stinger. */
export function stingerHints(c: HintContext): string[] {
  return [`${menuHint(c)} Skip`, `${jumpHint(c)} Continue`];
}

/**
 * The Controls table column to highlight: 1 Keen-style, 2 Modern, 3 Gamepad. The gamepad column
 * wins while a pad is the device in use.
 */
export const controlsColumn = (c: HintContext): number => (pad(c) ? 3 : c.layout === 1 ? 2 : 1);

/** The Controls screen as data: a header, the rows, the column to pick out, and the note beneath. */
export interface ControlsTable {
  /** The header cells, the action column first. */
  head: string[];
  /** One row per action, a cell per header cell (hint tokens, drawn as keycaps). */
  rows: string[][];
  /** The index of the column to pick out (the device in use). */
  on: number;
  /** The hint under the table. */
  note: string;
}

/**
 * The Controls table. The desktop table has a column per scheme (Keen-style, Modern, Gamepad) with the
 * device in use picked out. The touch table has one column, the on-screen controls' own names, and
 * uses only `TOUCH_LABELS`: no key or gamepad glyph. Where the page can go fullscreen both tables gain a
 * Fullscreen row (`F` on a keyboard, the button on touch).
 */
export function controlsTable(c: HintContext, onTouch: boolean): ControlsTable {
  if (onTouch) {
    const dpad = touchCap(TOUCH_LABELS.dpad);
    return {
      head: ['Action', 'Touch'],
      rows: [
        ['Move and aim', dpad],
        ['Jump', 'Jump button'],
        ['Pogo (toggle)', 'Pogo button'],
        ['Fizz', 'Fizz button'],
        ['Pause', touchCap(TOUCH_LABELS.pause)],
        ['Menus', `${dpad} ${touchCap(TOUCH_LABELS.select)} ${touchCap(TOUCH_LABELS.back)}`],
        ['Save / Load', 'Pause menu'],
        ...(c.fullscreenButton ? [['Fullscreen', 'Fullscreen button']] : []),
      ],
      on: 1,
      note: `Hold Jump while pogoing for a high bounce. Aim Fizz up or down with the ${dpad}.`,
    };
  }
  return {
    head: ['Action', 'Keen-style', 'Modern', 'Gamepad'],
    rows: [
      ['Move', '{[←]} {[→]}', '{[←]} {[→]} {[A]} {[D]}', 'D-pad / stick'],
      ['Jump', '{Ctrl}', '{[Z]}', padTokens(c, 'jump')],
      ['Pogo (toggle)', '{Alt}', '{[X]}', padTokens(c, 'pogo')],
      ['Fizz', '{Space}', '{[C]}', padTokens(c, 'fire')],
      ['Menu', '{Esc} {[Pause]}', '{Esc} {[P]} {[Pause]}', padTokens(c, 'pause')],
      ['Save / Load', '{F5} {F9}', '{F5} {F9}', 'Pause menu'],
      ...(c.fullscreen ? [['Fullscreen', '{[F]}', '{[F]}', '—']] : []),
    ],
    on: controlsColumn(c),
    note: 'Hold jump while pogoing for a high bounce. Aim fizz up with {[↑]}, or down with {[↓]} in the air.',
  };
}
