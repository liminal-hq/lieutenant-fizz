// The launcher's on-screen controls on a phone: the game's D-pad, Select and Back, driving the menu.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { touchWordCap } from '@lieutenant-fizz/engine/font/scale';
import { Input } from '@lieutenant-fizz/engine/input';
import { HeldRepeat } from '@lieutenant-fizz/engine/repeat';
import { TouchState, type TouchHeld } from '@lieutenant-fizz/engine/touch';
import { TouchControls, type TouchInput } from '@lieutenant-fizz/engine/touch-ui';
import { readTouchSettings, touchSpec } from '@lieutenant-fizz/engine/touch-settings';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';

/** What a press on the controls asks of the launcher. */
export type TouchAction =
  | { kind: 'step'; dir: -1 | 1 }
  | { kind: 'stop'; dir: -1 | 1 }
  | { kind: 'select' }
  | { kind: 'back' };

/** The widest word each face holds, in glyph pixels at scale 1: the same faces as the game's (Select is 29, Back 20). */
export const FACE_GLYPHS = { jump: 29, pogo: 20 } as const;

type Pressed = Pick<TouchHeld, 'left' | 'right' | 'up' | 'down' | 'jump' | 'pogo'>;

const DIRECTIONS = Input.LEFT | Input.RIGHT | Input.UP | Input.DOWN;

/**
 * Turns what the controls hold into what the menu does, as the game's menus read them: the D-pad moves (a held
 * direction fires at once and then repeats), Select (Jump) chooses on a fresh press, and Back (Pogo) goes back
 * on a fresh press, only where there is a screen to go back from.
 */
export class TouchMenuInput {
  private readonly repeat = new HeldRepeat(DIRECTIONS);
  private jump = false;
  private pogo = false;

  update(held: Pressed, now: number, hasBack: boolean): TouchAction[] {
    const out: TouchAction[] = [];
    const bits =
      (held.left ? Input.LEFT : 0) |
      (held.right ? Input.RIGHT : 0) |
      (held.up ? Input.UP : 0) |
      (held.down ? Input.DOWN : 0);
    const fired = this.repeat.update(bits, now);
    if (fired & Input.UP) out.push({ kind: 'step', dir: -1 });
    if (fired & Input.DOWN) out.push({ kind: 'step', dir: 1 });
    if (fired & Input.LEFT) out.push({ kind: 'stop', dir: -1 });
    if (fired & Input.RIGHT) out.push({ kind: 'stop', dir: 1 });
    if (held.jump && !this.jump) out.push({ kind: 'select' });
    if (held.pogo && !this.pogo && hasBack) out.push({ kind: 'back' });
    this.jump = held.jump;
    this.pogo = held.pogo;
    return out;
  }
}

export interface LauncherTouchDeps {
  /** The `#touch` layer the controls are built in. */
  layer: HTMLElement;
  /** Where the player's touch settings are kept (`lf-touch-v1`). */
  store: Pick<KeyValueStorage, 'getItem'>;
  /** Called for each press. */
  act(action: TouchAction): void;
  /** Whether the screen on show has somewhere to go on Back. */
  hasBack(): boolean;
  /** Whether the browser's bars are gone (fullscreen, or an installed app), where the game lifts its controls by their height. */
  chromeless(): boolean;
  /** The room the controls take beside the menu changed: padding for each side, in CSS pixels. */
  onGutters?(left: number, right: number): void;
}

export interface LauncherTouch {
  /** Shows or hides the controls. */
  setActive(on: boolean): void;
  /** Says the screen changed, so Back shows or hides. */
  refresh(): void;
  /** Places the controls again (the window changed size). */
  relayout(): void;
  /** The room the shown controls take: beside the menu (`left`, `right`) and how high each side's highest control reaches (`leftTop`, `rightTop`, 0 when none). */
  room(): { left: number; right: number; leftTop: number; rightTop: number };
  /** Runs once a frame: shows what is held and turns presses into actions. */
  frame(now: number): void;
  dispose(): void;
}

const LABELS = {
  dpad: 'Move',
  jump: 'Select',
  pogo: 'Back',
  fire: 'Fizz',
  pause: 'Pause',
} as const;

/**
 * The controls: the engine's `TouchControls` over a touch state of its own. The game's `InputManager` is not
 * used, because it listens to the keyboard for the game and would swallow Enter and Space on the menu's buttons.
 */
export function createLauncherTouch(deps: LauncherTouchDeps): LauncherTouch {
  const touch = new TouchState();
  const input: TouchInput = {
    touch,
    noteTouch: () => {},
    releaseTouch: () => touch.cancelAll(),
    command: () => {},
  };
  const settings = readTouchSettings(deps.store);
  let lifted = deps.chromeless();
  deps.layer.style.setProperty('--lf-touch-opacity', String(settings.opacity / 100));
  const controls = new TouchControls(deps.layer, input, {
    labels: LABELS,
    spec: touchSpec(settings, undefined, lifted),
    onPlaced: (face) => {
      // A word never outgrows its face, whatever the type scale of the screen is.
      for (const id of ['jump', 'pogo'] as const) {
        const cap = touchWordCap(face[id].r * 2, FACE_GLYPHS[id]);
        controls.face(id).style.setProperty('--lf-word-cap', String(cap));
      }
      const g = controls.gutters();
      deps.onGutters?.(g.left, g.right);
    },
  });
  const word = (id: 'jump' | 'pogo', text: string): void => {
    const span = document.createElement('span');
    span.className = 'lbl';
    span.textContent = text;
    controls.face(id).append(span);
  };
  word('jump', LABELS.jump);
  word('pogo', LABELS.pogo);
  // Select and Back act on lift, so sliding a thumb off a button cancels the press.
  controls.setDeferred(true);
  const menu = new TouchMenuInput();
  let active = false;
  const shown = (): ('dpad' | 'jump' | 'pogo')[] =>
    deps.hasBack() ? ['dpad', 'jump', 'pogo'] : ['dpad', 'jump'];
  return {
    setActive(on) {
      if (on === active) return;
      active = on;
      controls.setVisible(on);
      if (on) controls.setShown(shown());
      else deps.onGutters?.(0, 0);
    },
    refresh() {
      if (active) controls.setShown(shown());
    },
    relayout() {
      // Fullscreen or an installed display mode may have come or gone: the controls are lifted as the game's are.
      const now = deps.chromeless();
      if (now !== lifted) {
        lifted = now;
        controls.setSpec(touchSpec(settings, undefined, lifted));
      }
      controls.relayout();
    },
    room() {
      if (!active) return { left: 0, right: 0, leftTop: 0, rightTop: 0 };
      // Measured to the controls themselves: the menu has its own spacing, so no margin on top of it.
      const g = controls.gutters(0);
      const t = controls.tops(0);
      return { left: g.left, right: g.right, leftTop: t.left, rightTop: t.right };
    },
    frame(now) {
      if (!active) return;
      controls.frame(now);
      for (const action of menu.update(touch.sample(now), now, deps.hasBack())) deps.act(action);
    },
    dispose() {
      controls.dispose();
    },
  };
}
