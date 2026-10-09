// Which on-screen controls each screen shows, and what Jump and Pogo are called there.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ControlId } from '@lieutenant-fizz/engine/touch';
import { TOUCH_LABELS } from './hints';

/** The screens of the game shell (mirrors `Screen` in `game.ts`). */
export type ShellScreen =
  | 'loading'
  | 'title'
  | 'cine'
  | 'play'
  | 'pause'
  | 'card'
  | 'dialogue'
  | 'ending'
  | 'credits'
  | 'stinger';

/** A screen opened over the title or pause menu, or over another such screen (Sound or Touch controls over Options, then the editor). */
export type SubScreen = 'controls' | 'options' | 'saves' | 'sound' | 'touch' | 'touchEdit' | null;

export interface TouchFaces {
  /** The controls to show, in a fixed order. */
  shown: ControlId[];
  /** The words on the Jump and Pogo buttons (Pogo shows its icon in play). */
  jump: string;
  pogo: string;
  /** Whether the controls are the game's (play) or a gamepad for the menus. */
  play: boolean;
  /** The controls are being moved (the editor): they take drags, not presses. */
  edit?: boolean;
}

/**
 * The controls a screen shows. In play, all of them. On a menu, the D-pad moves, Jump is Select, and
 * Pogo (Back) shows only on a screen it goes back from. Fizz is hidden outside play, since it would
 * only repeat Select. Pause shows where it does something: it resumes from the pause menu, leaves the
 * menu entirely from a screen opened over it, and skips the cinematic, the credits and the stinger. A
 * screen opened over a menu (Controls, Options, Saves, Sound, Touch controls) also shows Back, which
 * closes it one level, as do Select and the Back button. The text screens
 * (cinematic, dialogue, ending, credits, stinger) have nothing to move, so they show no D-pad.
 */
export function touchFaces(screen: ShellScreen, sub: SubScreen): TouchFaces {
  const menu = (shown: ControlId[]): TouchFaces => ({
    shown,
    jump: TOUCH_LABELS.select,
    pogo: TOUCH_LABELS.back,
    play: false,
  });
  switch (screen) {
    case 'play':
      return {
        shown: ['dpad', 'jump', 'pogo', 'fire', 'pause'],
        jump: 'Jump',
        pogo: 'Pogo',
        play: true,
      };
    case 'title':
    case 'pause':
      // The editor shows the four movable controls as they look in play, and Pause is out of the way.
      if (sub === 'touchEdit') {
        return {
          shown: ['dpad', 'jump', 'pogo', 'fire'],
          jump: 'Jump',
          pogo: 'Pogo',
          play: true,
          edit: true,
        };
      }
      if (sub) return menu(['dpad', 'jump', 'pogo', 'pause']);
      return menu(screen === 'pause' ? ['dpad', 'jump', 'pause'] : ['dpad', 'jump']);
    case 'card':
      return menu(['dpad', 'jump']);
    case 'cine':
    case 'credits':
    case 'stinger':
      return menu(['jump', 'pause']);
    case 'dialogue':
    case 'ending':
      return menu(['jump']);
    case 'loading':
      return menu([]);
  }
}
