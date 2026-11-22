// Keyboard and gamepad input mapped to sim input bits and menu commands.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buttonsToBits, DEFAULT_PAD_BINDINGS, type PadBindings } from './gamepad-bindings';
import {
  DEFAULT_KEY_SCHEME,
  keyScheme,
  MOVE_KEYS,
  mouseButton,
  schemeCodes,
  usesMouse,
  type KeyScheme,
} from './key-schemes';
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
  /**
   * Pause, or one step back out of a menu. `leave` is set by the on-screen Pause button: from a screen
   * opened over a menu it leaves the whole menu instead of going back one level. `esc` is set by the Esc
   * key, which in fullscreen with Esc locked also leaves fullscreen from the top of a menu.
   */
  | { type: 'pause'; leave?: boolean; esc?: boolean }
  | { type: 'confirm' }
  | { type: 'quickSave' }
  | { type: 'quickLoad' }
  | { type: 'togglePanel' }
  | { type: 'zoom'; factor: number }
  | { type: 'zoomReset' }
  | { type: 'fullscreen' };

/** How often connected pads are sampled between fixed ticks, in milliseconds, so a press shorter than a tick is not lost. */
export const PAD_POLL_MS = 4;

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

/**
 * Whether unplugging pad `index` takes away the pad the player was using: the gamepad is the device in
 * use and the pad is the one that last had input (or none has had input yet).
 */
export function padLostInUse(device: InputDevice, lastPad: number, index: number): boolean {
  return device === 'gamepad' && (lastPad < 0 || lastPad === index);
}

/**
 * Whether a key press is the fullscreen shortcut: `F` on its own. `F` is free in both layouts (movement
 * is the arrows and WASD, the actions Ctrl, Alt and Space or Z, X and C), so it needs no rebinding.
 * Ctrl, Alt (Pogo) and Meta with `F` are left to the browser and the game, and a held key does not repeat.
 */
export function isFullscreenKey(e: {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  return e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey;
}

/**
 * Whether a key press is a pause key, and which: Esc (`esc`), or `P` and the Pause/Break key (`key`).
 * Null for anything else, and for a held key that repeats. The Pause key is matched by `code` or `key`,
 * since layouts differ in which one carries it; it is free in every layout, so it needs no rebinding.
 */
export function pauseKeyKind(e: {
  code: string;
  key?: string;
  repeat: boolean;
}): 'esc' | 'key' | null {
  if (e.repeat) return null;
  if (e.code === 'Escape') return 'esc';
  if (e.code === 'KeyP' || e.code === 'Pause' || e.key === 'Pause') return 'key';
  return null;
}

/**
 * The command a key raises on its own, apart from Pause and fullscreen (see {@link pauseKeyKind} and
 * {@link isFullscreenKey}): Enter confirms, F5 and F9 save and load, the backquote toggles the debug
 * panel, and Minus, Equal and 0 zoom. Null for any other key. The input manager emits exactly these, and the
 * Input test page names them, so the two cannot disagree.
 */
export function keyCommand(code: string): Command | null {
  switch (code) {
    case 'Enter':
      return { type: 'confirm' };
    case 'F5':
      return { type: 'quickSave' };
    case 'F9':
      return { type: 'quickLoad' };
    case 'Backquote':
      return { type: 'togglePanel' };
    case 'Minus':
      return { type: 'zoom', factor: 1 / 1.25 };
    case 'Equal':
      return { type: 'zoom', factor: 1.25 };
    case 'Digit0':
      return { type: 'zoomReset' };
    default:
      return null;
  }
}

/** A key event as the raw key tap reports it ({@link InputManager.onRawKey}). `blur` means every key was let go at once. */
export interface RawKeyEvent {
  type: 'down' | 'up' | 'blur';
  /** The physical key (`KeyboardEvent.code`); empty for `blur`. */
  code: string;
  /** The key's value, which the Pause key is sometimes matched by. */
  key: string;
  /** A held key repeating. The input manager ignores repeats; the tap still sees them. */
  repeat: boolean;
}

/** Whether a key press lands in a text field, where typing is the field's. */
export function isFieldTarget(target: { tagName?: string } | null): boolean {
  return !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '');
}

/** The keys the page keeps from the browser whichever scheme is chosen; a scheme adds its own (see `schemeCodes`). */
const MAPPED = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Enter',
  'Escape',
  'Pause',
  'F5',
  'F9',
  'Tab',
]);

/** Turns a set of pressed key codes into held bits for a key scheme (the Modern one until another is chosen). */
export function keysToBits(
  keys: ReadonlySet<string>,
  scheme: KeyScheme = keyScheme(DEFAULT_KEY_SCHEME),
): number {
  const any = (codes: readonly string[]): boolean => codes.some((c) => keys.has(c));
  let b = 0;
  if (any(MOVE_KEYS.left)) b |= Input.LEFT;
  if (any(MOVE_KEYS.right)) b |= Input.RIGHT;
  if (any(MOVE_KEYS.up)) b |= Input.UP;
  if (any(MOVE_KEYS.down)) b |= Input.DOWN;
  if (any(scheme.jump)) b |= Input.JUMP;
  if (any(scheme.pogo)) b |= Input.POGO;
  if (any(scheme.fire)) b |= Input.FIRE;
  return b;
}

/** The held bits the mouse gives in a scheme: `buttons` are the buttons down, as `MouseEvent.buttons` counts them. */
export function mouseToBits(buttons: ReadonlySet<number>, scheme: KeyScheme): number {
  let b = 0;
  if (buttons.has(mouseButton(scheme, 'jump') ?? -1)) b |= Input.JUMP;
  if (buttons.has(mouseButton(scheme, 'pogo') ?? -1)) b |= Input.POGO;
  if (buttons.has(mouseButton(scheme, 'fire') ?? -1)) b |= Input.FIRE;
  return b;
}

/**
 * Standard-mapping gamepad to held bits; also reports whether the Pause button (Start by default) is
 * down. The D-pad and the left stick are fixed; Jump, Pogo, Fizz and Pause follow `bindings`, which are
 * the standard mapping's A, B and Y, X and RT, and Start until the player changes them.
 */
export function padToBits(
  pad: Pick<Gamepad, 'buttons' | 'axes'>,
  bindings: PadBindings = DEFAULT_PAD_BINDINGS,
): {
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
  const held = buttonsToBits(bindings, pad);
  if (held.jump) bits |= Input.JUMP;
  if (held.pogo) bits |= Input.POGO;
  if (held.fire) bits |= Input.FIRE;
  return { bits, start: held.pause };
}

/**
 * The pad to rumble: the one whose index is `lastIndex` (the pad last used), or failing that the first
 * connected one. `pads` is what `navigator.getGamepads()` returns, with `null` for empty slots.
 */
export function pickPad<T>(pads: ArrayLike<T | null>, lastIndex: number): T | null {
  const last = lastIndex >= 0 ? pads[lastIndex] : null;
  if (last) return last;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p) return p;
  }
  return null;
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
 * Combines the held bits from each source. Touch counts only while `touchEnabled` (while the
 * on-screen controls show, so a hidden control never holds a bit). `blocked` silences every source.
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
  /** Index of the pad that last had input, or -1. */
  private lastPad = -1;
  /** The device the player last used. Starts on the gamepad if one is already connected. */
  device: InputDevice = 'keyboard';
  private readonly deviceHandlers = new Set<(d: InputDevice) => void>();
  private readonly keyTaps = new Set<(e: RawKeyEvent) => boolean | void>();
  private readonly padLostHandlers = new Set<() => void>();
  private readonly padChangeHandlers = new Set<() => void>();
  /** When true, held bits are suppressed (menus, dialogue) but commands still fire. */
  blocked = false;
  /** The touch controls' state. A DOM controller feeds it; its bits count only while touch is enabled. */
  readonly touch = new TouchState();
  private touchEnabled = false;
  /** Which buttons do Jump, Pogo, Fizz and Pause. The D-pad and left stick are fixed. */
  private padBindings: PadBindings = DEFAULT_PAD_BINDINGS;
  /**
   * Whether the pad drives the game. `listening` ignores it entirely (a screen is reading raw buttons to
   * bind one); `holdoff` follows a listen and ignores it until every button is up, so the press that
   * bound a button cannot also act as it.
   */
  private padGate: 'open' | 'listening' | 'holdoff' = 'open';
  // Fast pad polling (see `setLatch`).
  private latchOn = true;
  private disposed = false;
  private padTimer: ReturnType<typeof setInterval> | null = null;
  /** The pad's action bits at the last fast sample. */
  private padSampled = 0;
  /** Pad bits that went from low to high since the last tick: delivered on the next one even if let go again. */
  private padLatch = 0;
  /** Pad bits that went low since the last tick. */
  private padFell = 0;
  /** The pad bits the last tick reported. */
  private padHighAtPoll = 0;
  private padTick = 0;
  /** The bits of keys pressed since the last tick. */
  private keyLatch = 0;
  /** The key scheme in use (an index into `KEY_SCHEMES`), the codes it keeps from the browser, and the mouse buttons down. */
  private scheme = keyScheme(DEFAULT_KEY_SCHEME);
  private schemeKeys = new Set<string>(schemeCodes(this.scheme));
  private readonly mouseDown = new Set<number>();
  private lastPadBits = 0;
  private lastOtherBits = 0;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isFieldTarget(e.target as HTMLElement | null)) return;
    if (MAPPED.has(e.code) || this.schemeKeys.has(e.code) || e.key === 'Pause') e.preventDefault();
    this.setDevice('key');
    const cancel = this.tapKey({ type: 'down', code: e.code, key: e.key, repeat: e.repeat });
    if (cancel && !e.ctrlKey && !e.metaKey) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    // A key let go before the next tick still gives that tick one frame of its bits.
    if (this.latchOn) this.keyLatch |= keysToBits(new Set([e.code]), this.scheme);
    // Emitted inside the keydown handler, so a handler can ask for fullscreen while the press counts as a gesture.
    if (isFullscreenKey(e)) this.emit({ type: 'fullscreen' });
    const pause = pauseKeyKind(e);
    if (pause) this.emit(pause === 'esc' ? { type: 'pause', esc: true } : { type: 'pause' });
    if (e.code === 'Enter') this.confirmPending = true;
    const command = keyCommand(e.code);
    if (command) this.emit(command);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    this.tapKey({ type: 'up', code: e.code, key: e.key, repeat: false });
    // Alt on its own focuses the browser's menu bar on release; only a scheme that plays with Alt keeps it from that.
    if (e.code.startsWith('Alt') && this.schemeKeys.has(e.code)) e.preventDefault();
  };
  private readonly onBlur = (): void => {
    this.keys.clear();
    this.mouseDown.clear();
    this.tapKey({ type: 'blur', code: '', key: '', repeat: false });
    this.releaseTouch();
  };
  private readonly onHidden = (): void => {
    if (document.hidden) this.releaseTouch();
  };
  /** Whether a pointer event is the mouse on the game itself, which is where a scheme's mouse buttons act (menus take clicks as clicks). */
  private onGame(e: PointerEvent): boolean {
    return (
      usesMouse(this.scheme) && e.pointerType === 'mouse' && e.target instanceof HTMLCanvasElement
    );
  }
  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.onGame(e)) return;
    this.setDevice('key');
    this.mouseDown.add(e.button);
    // A click let go before the next tick still gives that tick one frame of its bits.
    if (this.latchOn) this.keyLatch |= mouseToBits(new Set([e.button]), this.scheme);
  };
  private readonly onPointerUp = (e: PointerEvent): void => {
    this.mouseDown.delete(e.button);
  };
  /** The right button's menu would open over the game while a scheme uses the mouse (WASD). */
  private readonly onContextMenu = (e: MouseEvent): void => {
    if (usesMouse(this.scheme) && e.target instanceof HTMLCanvasElement) e.preventDefault();
  };
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.emit({ type: 'zoom', factor: Math.exp(-e.deltaY * 0.0015) });
  };

  private readonly onPadConnected = (): void => {
    this.setDevice('pad-connected');
    this.syncTimer();
  };
  private readonly onPadDisconnected = (e: Event): void => {
    const index = (e as GamepadEvent).gamepad?.index ?? -1;
    const inUse = padLostInUse(this.device, this.lastPad, index);
    this.setDevice('pad-disconnected', this.padCount());
    this.syncTimer(index);
    if (inUse) for (const h of this.padLostHandlers) h();
  };

  constructor(private readonly host: HTMLElement) {
    if (this.padCount() > 0) this.device = 'gamepad';
    window.addEventListener('gamepadconnected', this.onPadConnected);
    window.addEventListener('gamepaddisconnected', this.onPadDisconnected);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onBlur);
    host.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    host.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('visibilitychange', this.onHidden);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    this.syncTimer();
  }

  /** How many pads are connected, not counting the one at `excludeIndex` (a pad that is going away). */
  private padCount(excludeIndex = -1): number {
    try {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      return Array.from(pads).filter((p) => !!p && p.index !== excludeIndex).length;
    } catch {
      // A browser that refuses the read (an insecure page, a blocking policy) has no pads to poll.
      return 0;
    }
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

  /**
   * Calls `fn` with every key event the manager sees: a key down (repeats too), a key up, and a blur that lets
   * every key go. The Input test page reads keys here, so it shows what the game receives. A tap that returns
   * true has the key's default action cancelled (not while Ctrl or Meta is held, so the browser's own shortcuts
   * keep working). Returns an unsubscribe function.
   */
  onRawKey(fn: (e: RawKeyEvent) => boolean | void): () => void {
    this.keyTaps.add(fn);
    return () => this.keyTaps.delete(fn);
  }

  private tapKey(e: RawKeyEvent): boolean {
    let cancel = false;
    for (const t of this.keyTaps) cancel = t(e) === true || cancel;
    return cancel;
  }

  /** The pad bindings in use, which {@link padToBits} reads. */
  get bindings(): PadBindings {
    return this.padBindings;
  }

  /** Every pad as `navigator.getGamepads()` lists it, empty slots as null (empty where the browser has no gamepad support). */
  pads(): (Gamepad | null)[] {
    return typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [];
  }

  /** Calls `fn` when a different pad becomes the one in use (the device can stay the gamepad, so `onDevice` does not fire). Returns an unsubscribe function. */
  onPadChange(fn: () => void): () => void {
    this.padChangeHandlers.add(fn);
    return () => this.padChangeHandlers.delete(fn);
  }

  /** Calls `fn` when the pad the player was using is unplugged. Returns an unsubscribe function. */
  onPadLost(fn: () => void): () => void {
    this.padLostHandlers.add(fn);
    return () => this.padLostHandlers.delete(fn);
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

  /** Turns the touch controls on or off (on while they show). Turning them off drops any held finger. */
  setTouchEnabled(enabled: boolean): void {
    if (!enabled && this.touchEnabled) this.releaseTouch();
    this.touchEnabled = enabled;
  }

  /** Releases every touch (pointer cancel, blur, the page hiding). */
  releaseTouch(): void {
    this.touch.cancelAll();
  }

  /**
   * Marks the touch presses as seen. A screen the sim does not step (a menu) calls this once it has
   * read the bits for the frame; without it a press that ended would stay held until play resumed, and a
   * menu would never see another fresh press.
   */
  markTouchSeen(): void {
    this.touch.sample(performance.now());
  }

  /** The pad the player is using, for rumble: the one that last had input, else the first connected. Null with none. */
  activePad(): Gamepad | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    return pickPad(pads, this.lastPad);
  }

  /** Sets which buttons do Jump, Pogo, Fizz and Pause. A button held now does not act as its new action until it is released. */
  setPadBindings(bindings: PadBindings): void {
    this.padBindings = bindings;
    this.prevStart = false;
    this.dropLatch();
    if (this.padGate === 'open') this.padGate = 'holdoff';
  }

  /**
   * Turns pad listening on or off. While on, the pad sends no bits and no Pause (a screen reads the raw
   * buttons with `padButtons`); turning it off waits for every button to come up before the pad drives
   * the game again.
   */
  setPadListening(on: boolean): void {
    this.padGate = on ? 'listening' : 'holdoff';
    this.prevStart = false;
    this.dropLatch();
  }

  /** The standard-mapping buttons held on any connected pad right now (all 0 to 15; the stick axes are not buttons). */
  padButtons(): Set<number> {
    const held = new Set<number>();
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      gp.buttons.forEach((b, i) => {
        if (b.pressed && i < 16) held.add(i);
      });
    }
    return held;
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
    if (this.padGate === 'holdoff' && this.padButtons().size === 0) this.padGate = 'open';
    for (const gp of pads) {
      if (!gp) continue;
      pad = true;
      if (this.padGate !== 'open') continue;
      const r = padToBits(gp, this.padBindings);
      padBits |= r.bits;
      start ||= r.start;
      if (r.bits || r.start) {
        const changed = this.lastPad !== gp.index;
        this.lastPad = gp.index;
        this.setDevice('pad-input');
        if (changed) for (const h of this.padChangeHandlers) h();
      }
    }
    this.padConnected = pad;
    if (start && !this.prevStart) this.emit({ type: 'pause' });
    this.prevStart = start;
    const src = {
      keys: keysToBits(this.keys, this.scheme) | mouseToBits(this.mouseDown, this.scheme),
      pad: padBits,
      touch: touchToBits(
        !this.touchEnabled
          ? NO_TOUCH
          : consume
            ? this.touch.sample(performance.now())
            : this.touch.held(performance.now()),
      ),
    };
    const gate = { touchEnabled: this.touchEnabled, blocked: this.blocked };
    // The sources apart from the pad, so a pad bit can be withheld for a tick without hiding a key or finger.
    this.lastPadBits = padBits;
    this.lastOtherBits = inputBits({ ...src, pad: 0 }, gate);
    return inputBits(src, gate);
  }

  /**
   * Held bits for one fixed tick; CONFIRM (from Enter) is a one-shot latch consumed here. With latching on, a
   * pad button or key pressed and let go since the last tick still reads as held for this one, and a pad
   * action held at the last tick, let go and pressed again since reads low now and high on the next tick (so
   * the sim's edge detection sees two presses).
   */
  poll(): number {
    let bits = this.read(true);
    if (this.latchOn && !this.blocked) {
      this.samplePads();
      const split = this.padLatch & this.padFell & this.padHighAtPoll;
      const padOut = (this.lastPadBits | this.padLatch) & ~split;
      bits = this.lastOtherBits | this.keyLatch | padOut;
      // The deferred press is delivered on the next tick.
      this.padLatch = split;
      this.padFell = 0;
      this.keyLatch = 0;
      this.padHighAtPoll = padOut;
      this.padTick = padOut;
    } else {
      this.padTick = this.lastPadBits;
    }
    if (this.confirmPending) {
      if (!this.blocked) bits |= Input.CONFIRM;
      this.confirmPending = false;
    }
    return bits;
  }

  /** The pad's share of the bits the last `poll()` returned (what the game's tick path got from the pad). */
  get padTickBits(): number {
    return this.padTick;
  }

  /** Whether short presses are latched between ticks. On unless turned off with {@link setLatch}. */
  get latching(): boolean {
    return this.latchOn;
  }

  /**
   * Turns the fast pad timer and the latches on or off (`?debug&latch=off`, and the Input test's Fast polling
   * switch). Off is the old behaviour exactly: no timer, nothing latched. Not saved.
   */
  setLatch(on: boolean): void {
    if (on === this.latchOn) return;
    this.latchOn = on;
    this.dropLatch();
    this.syncTimer();
  }

  /** Forgets every press waiting for the next tick (a screen with no fixed ticks, a rebind, a pad gone). */
  dropLatch(): void {
    this.padLatch = 0;
    this.padFell = 0;
    this.padHighAtPoll = 0;
    this.keyLatch = 0;
    this.padSampled = 0;
  }

  /** The pad's action bits right now, as `read` makes them, but touching nothing: no gate change, no device change, no Pause. */
  private padBitsNow(): number {
    if (this.padGate !== 'open') return 0;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let bits = 0;
    for (const gp of pads) if (gp) bits |= padToBits(gp, this.padBindings).bits;
    return bits;
  }

  /** One fast sample: a bit that has gone from low to high is latched, one that has gone low is marked. Never throws. */
  private samplePads(): void {
    if (!this.latchOn || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const bits = this.padBitsNow();
      this.padLatch |= bits & ~this.padSampled;
      this.padFell |= this.padSampled & ~bits;
      this.padSampled = bits;
    } catch {
      // A pad that cannot be read this moment is read again at the next sample.
    }
  }

  /** Runs the fast timer exactly while latching is on, the manager is alive and a pad is connected. */
  private syncTimer(excludeIndex = -1): void {
    const want = this.latchOn && !this.disposed && this.padCount(excludeIndex) > 0;
    if (want && this.padTimer === null) {
      this.padTimer = setInterval(() => this.samplePads(), PAD_POLL_MS);
    } else if (!want && this.padTimer !== null) {
      clearInterval(this.padTimer);
      this.padTimer = null;
      this.dropLatch();
    }
  }

  /** Drops a pending Enter press (it was consumed by a menu, not the game). */
  discardLatched(): void {
    this.confirmPending = false;
  }

  dispose(): void {
    this.disposed = true;
    this.syncTimer();
    window.removeEventListener('gamepadconnected', this.onPadConnected);
    window.removeEventListener('gamepaddisconnected', this.onPadDisconnected);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onBlur);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.host.removeEventListener('wheel', this.onWheel);
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.host.removeEventListener('contextmenu', this.onContextMenu);
  }

  /** Picks the key scheme (an index into `KEY_SCHEMES`). Keys already down are let go, so a key from the old scheme cannot stick. */
  setKeyScheme(index: number): void {
    const next = keyScheme(index);
    if (next === this.scheme) return;
    this.scheme = next;
    this.schemeKeys = new Set(schemeCodes(next));
    this.keys.clear();
    this.mouseDown.clear();
    this.keyLatch = 0;
  }

  /** The key scheme in use. */
  get keySchemeInUse(): KeyScheme {
    return this.scheme;
  }
}
