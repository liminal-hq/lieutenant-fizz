// Keyboard and gamepad input mapped to sim input bits and menu commands.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { NO_TOUCH, TouchState, type TouchHeld } from './touch';

/** Input bits handed to the sim each fixed tick (mirrors `world::input` in the Rust sim). */
export const Input = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  JUMP: 16,
  POGO: 32,
  FIRE: 64,
  CONFIRM: 128,
} as const;

/** One-shot commands for the shell (menus, saves, camera zoom). */
export type Command =
  | { type: 'pause' }
  | { type: 'confirm' }
  | { type: 'quickSave' }
  | { type: 'quickLoad' }
  | { type: 'togglePanel' }
  | { type: 'zoom'; factor: number }
  | { type: 'zoomReset' };

/** Which kind of input the player last used, so hints can show the matching labels. */
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/** Something that can change the hint device. */
export type DeviceEvent = 'key' | 'pad-input' | 'pad-connected' | 'pad-disconnected' | 'touch';

/**
 * The hint device after an event. A key press means keyboard, a gamepad button or stick move means
 * gamepad, connecting a pad switches to it, and unplugging the last pad goes back to the keyboard. A
 * touch means touch. Unplugging a pad only matters while the gamepad is the device in use.
 */
export function nextDevice(current: InputDevice, event: DeviceEvent, padsLeft = 0): InputDevice {
  switch (event) {
    case 'key':
      return 'keyboard';
    case 'pad-input':
    case 'pad-connected':
      return 'gamepad';
    case 'pad-disconnected':
      if (current !== 'gamepad') return current;
      return padsLeft > 0 ? current : 'keyboard';
    case 'touch':
      return 'touch';
  }
}

const MAPPED = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'KeyZ',
  'KeyX',
  'KeyC',
  'Enter',
  'Escape',
  'F5',
  'F9',
  'Tab',
]);

/** Turns a set of pressed key codes into held bits (Keen-style and modern layouts). */
export function keysToBits(keys: ReadonlySet<string>): number {
  const k = (c: string): boolean => keys.has(c);
  let b = 0;
  if (k('ArrowLeft') || k('KeyA')) b |= Input.LEFT;
  if (k('ArrowRight') || k('KeyD')) b |= Input.RIGHT;
  if (k('ArrowUp') || k('KeyW')) b |= Input.UP;
  if (k('ArrowDown') || k('KeyS')) b |= Input.DOWN;
  if (k('ControlLeft') || k('ControlRight') || k('KeyZ')) b |= Input.JUMP;
  if (k('AltLeft') || k('AltRight') || k('KeyX')) b |= Input.POGO;
  if (k('Space') || k('KeyC')) b |= Input.FIRE;
  return b;
}

/** Standard-mapping gamepad to held bits; also reports whether Start is down. */
export function padToBits(pad: Pick<Gamepad, 'buttons' | 'axes'>): {
  bits: number;
  start: boolean;
} {
  const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  let bits = 0;
  if (b(14) || ax < -0.4) bits |= Input.LEFT;
  if (b(15) || ax > 0.4) bits |= Input.RIGHT;
  if (b(12) || ay < -0.5) bits |= Input.UP;
  if (b(13) || ay > 0.5) bits |= Input.DOWN;
  if (b(0)) bits |= Input.JUMP;
  if (b(1) || b(3)) bits |= Input.POGO;
  if (b(2) || b(7)) bits |= Input.FIRE;
  return { bits, start: b(9) };
}

/** The held touch controls as sim input bits. */
export function touchToBits(t: TouchHeld): number {
  let b = 0;
  if (t.left) b |= Input.LEFT;
  if (t.right) b |= Input.RIGHT;
  if (t.up) b |= Input.UP;
  if (t.down) b |= Input.DOWN;
  if (t.jump) b |= Input.JUMP;
  if (t.pogo) b |= Input.POGO;
  if (t.fire) b |= Input.FIRE;
  return b;
}

/**
 * Combines the held bits from each source. Touch counts only while `touchEnabled` (in play), so a
 * thumb on a control never drives a menu. `blocked` silences every source.
 */
export function inputBits(
  src: { keys: number; pad: number; touch: number },
  gate: { touchEnabled: boolean; blocked: boolean },
): number {
  if (gate.blocked) return 0;
  return src.keys | src.pad | (gate.touchEnabled ? src.touch : 0);
}

/**
 * Keyboard, gamepad and touch input. `poll()` is called once per fixed tick and returns the held bits;
 * edge detection happens inside the sim. Menu-style keys arrive as commands.
 */
export class InputManager {
  private keys = new Set<string>();
  private confirmPending = false;
  private prevStart = false;
  private readonly handlers = new Set<(c: Command) => void>();
  padConnected = false;
  /** The device the player last used. Starts on the gamepad if one is already connected. */
  device: InputDevice = 'keyboard';
  private readonly deviceHandlers = new Set<(d: InputDevice) => void>();
  /** When true, held bits are suppressed (menus, dialogue) but commands still fire. */
  blocked = false;
  /** The touch controls' state. A DOM controller feeds it; its bits count only while touch is enabled. */
  readonly touch = new TouchState();
  private touchEnabled = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (MAPPED.has(e.code)) e.preventDefault();
    this.setDevice('key');
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'Escape':
      case 'KeyP':
        this.emit({ type: 'pause' });
        break;
      case 'Enter':
        this.confirmPending = true;
        this.emit({ type: 'confirm' });
        break;
      case 'F5':
        this.emit({ type: 'quickSave' });
        break;
      case 'F9':
        this.emit({ type: 'quickLoad' });
        break;
      case 'Backquote':
        this.emit({ type: 'togglePanel' });
        break;
      case 'Minus':
        this.emit({ type: 'zoom', factor: 1 / 1.25 });
        break;
      case 'Equal':
        this.emit({ type: 'zoom', factor: 1.25 });
        break;
      case 'Digit0':
        this.emit({ type: 'zoomReset' });
        break;
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code.startsWith('Alt')) e.preventDefault();
  };
  private readonly onBlur = (): void => {
    this.keys.clear();
    this.releaseTouch();
  };
  private readonly onHidden = (): void => {
    if (document.hidden) this.releaseTouch();
  };
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.emit({ type: 'zoom', factor: Math.exp(-e.deltaY * 0.0015) });
  };

  private readonly onPadConnected = (): void => this.setDevice('pad-connected');
  private readonly onPadDisconnected = (): void =>
    this.setDevice('pad-disconnected', this.padCount());

  constructor(private readonly host: HTMLElement) {
    if (this.padCount() > 0) this.device = 'gamepad';
    window.addEventListener('gamepadconnected', this.onPadConnected);
    window.addEventListener('gamepaddisconnected', this.onPadDisconnected);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onBlur);
    document.addEventListener('visibilitychange', this.onHidden);
    host.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private padCount(): number {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    return Array.from(pads).filter(Boolean).length;
  }

  private setDevice(event: DeviceEvent, padsLeft = 0): void {
    const next = nextDevice(this.device, event, padsLeft);
    if (next === this.device) return;
    this.device = next;
    for (const h of this.deviceHandlers) h(next);
  }

  /** Calls `fn` whenever the last-used device changes. Returns an unsubscribe function. */
  onDevice(fn: (d: InputDevice) => void): () => void {
    this.deviceHandlers.add(fn);
    return () => this.deviceHandlers.delete(fn);
  }

  onCommand(fn: (c: Command) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  private emit(c: Command): void {
    for (const h of this.handlers) h(c);
  }

  /** Runs a command from outside the keyboard handlers (the on-screen Pause button). */
  command(c: Command): void {
    this.emit(c);
  }

  /** A finger touched the controls: touch is now the device the hints should match. */
  noteTouch(): void {
    this.setDevice('touch');
  }

  /** Turns the touch controls on or off (on in play only). Turning them off drops any held finger. */
  setTouchEnabled(enabled: boolean): void {
    if (!enabled && this.touchEnabled) this.releaseTouch();
    this.touchEnabled = enabled;
  }

  /** Releases every touch (pointer cancel, blur, the page hiding). */
  releaseTouch(): void {
    this.touch.cancelAll();
  }

  /** Held bits right now, without consuming the one-shot CONFIRM latch. */
  peek(): number {
    return this.read(false);
  }

  /** Held bits from every source. A step (`consume`) also marks touch presses as seen by the sim. */
  private read(consume: boolean): number {
    let padBits = 0;
    let pad = false;
    let start = false;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      pad = true;
      const r = padToBits(gp);
      padBits |= r.bits;
      start ||= r.start;
      if (r.bits || r.start) this.setDevice('pad-input');
    }
    this.padConnected = pad;
    if (start && !this.prevStart) this.emit({ type: 'pause' });
    this.prevStart = start;
    return inputBits(
      {
        keys: keysToBits(this.keys),
        pad: padBits,
        touch: touchToBits(
          !this.touchEnabled
            ? NO_TOUCH
            : consume
              ? this.touch.sample(performance.now())
              : this.touch.held(performance.now()),
        ),
      },
      { touchEnabled: this.touchEnabled, blocked: this.blocked },
    );
  }

  /** Held bits for one fixed tick; CONFIRM (from Enter) is a one-shot latch consumed here. */
  poll(): number {
    let bits = this.read(true);
    if (this.confirmPending) {
      if (!this.blocked) bits |= Input.CONFIRM;
      this.confirmPending = false;
    }
    return bits;
  }

  /** Drops a pending Enter press (it was consumed by a menu, not the game). */
  discardLatched(): void {
    this.confirmPending = false;
  }

  dispose(): void {
    window.removeEventListener('gamepadconnected', this.onPadConnected);
    window.removeEventListener('gamepaddisconnected', this.onPadDisconnected);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onBlur);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.host.removeEventListener('wheel', this.onWheel);
  }
}
