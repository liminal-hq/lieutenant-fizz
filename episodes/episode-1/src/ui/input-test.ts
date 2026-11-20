// The Input test page: what the game receives from the pad, keyboard, touch screen and mouse, live, as raw input and as game actions.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { padActionToken, type PadFamily } from '@lieutenant-fizz/engine/gamepad-labels';
import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { Input, type InputDevice, type InputManager } from '@lieutenant-fizz/engine/input';
import {
  HoldToLeave,
  LitTracker,
  PAUSE_NAME,
  PadTracker,
  Ring,
  STRIP_NAMES,
  SamplingProbe,
  TouchProbe,
  WORD,
  actionText,
  backHeld,
  buttonLabel,
  isStandard,
  keyActions,
  keyName,
  layoutNote,
  logLine,
  mappingReport,
  mouseButtonName,
  padLine,
  padRows,
  reportText,
  sampleOf,
  samplingLines,
  snapPad,
  eventDevice,
  type DescribeContext,
  type PadSnap,
  type RawEvent,
  type TestDevice,
} from '@lieutenant-fizz/engine/input-test';
import type { Circle, ControlId, Shape, TouchLayout } from '@lieutenant-fizz/engine/touch';
import {
  MOUSE_PARTS,
  MOUSE_UNITS,
  PAD_LABELS,
  PAD_PARTS,
  PAD_STICKS,
  PAD_UNITS,
  keyboardParts,
} from '../input-test-art';

/** What the page needs from the game. */
export interface InputTestHost {
  input: InputManager;
  /** Adds a node to the overlay layer. */
  mount(node: HTMLElement): void;
  /** Leaves the page (the screen under it comes back). */
  leave(): void;
  /** Options › Controls: 0 Keen-style, 1 Modern. */
  layout(): number;
  /** The family of the pad in use, for button names. */
  family(): PadFamily;
  /** Where the on-screen controls sit for this window, as in play. */
  placed(): { hit: TouchLayout; face: Record<ControlId, Circle> };
  /** Motion is reduced: lit parts change state with no fade. */
  reduced(): boolean;
  /** "web" or "app". */
  hostName(): string;
}

type View = 'pad' | 'sampling' | 'mapping';

const DEVICES: readonly [TestDevice, string][] = [
  ['gamepad', 'Gamepad'],
  ['keyboard', 'Keyboard'],
  ['touch', 'Touch'],
  ['mouse', 'Mouse'],
];

const VIEWS: readonly [View, string][] = [
  ['pad', 'Pad'],
  ['sampling', 'Sampling'],
  ['mapping', 'Mapping'],
];

const LOG_SHOWN = 12;
const LOG_KEPT = 20;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const setText = (e: HTMLElement, text: string): void => {
  if (e.textContent !== text) e.textContent = text;
};

const px = (v: number): string => `${Math.round(v)}px`;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The part of a shape's box, for outlining a hit area. */
function boxOf(s: Shape): { x: number; y: number; w: number; h: number; round: boolean } {
  return 'r' in s
    ? { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2, round: true }
    : { x: s.x, y: s.y, w: s.w, h: s.h, round: false };
}

/** What a control's ghost says when its name does not fit in the box; the full name stays in its label and title. */
const SHORT_NAMES: Record<ControlId, string> = {
  dpad: 'D',
  jump: 'J',
  pogo: 'Po',
  fire: 'F',
  pause: 'Pa',
};

const CONTROL_NAMES: Record<ControlId, string> = {
  dpad: 'D-pad',
  jump: 'Jump',
  pogo: 'Pogo',
  fire: 'Fizz',
  pause: 'Pause',
};

/**
 * The page. It is in the document only while open. Keys come from the input manager's key tap and pads from
 * its `getGamepads` read, and every action name comes from the engine's own mapping functions
 * (`input-test.ts`), so what it shows is what the game receives. Nothing is stored or sent: the log lives in
 * memory and is cleared on leave.
 */
export class InputTestPage {
  readonly root = el('div', 'lf');
  private readonly tabs = new Map<TestDevice, HTMLButtonElement>();
  private readonly panels = new Map<TestDevice, HTMLElement>();
  private readonly auto = el('button', 'it-ctl', 'Auto');
  private readonly leaveNote = el('div', 'it-leave');
  private readonly holdBar = el('div', 'it-hold');
  private readonly holdFill = el('i');
  private readonly logBox = el('div', 'it-log');
  private readonly strip = el('div', 'it-strip');
  private readonly chips = new Map<string, HTMLElement>();
  // The pad panel
  private readonly padPick = el('div', 'it-row');
  private readonly padViews = new Map<View, HTMLButtonElement>();
  private readonly padNone = el('div', 'it-text');
  private readonly padInfo = el('div', 'it-lines');
  private readonly padWrap = el('div', 'it-picwrap');
  private readonly padPic = el('div', 'it-pad');
  private readonly padGeneric = el('div', 'it-generic');
  private readonly padPartEls = new Map<number, HTMLElement>();
  private readonly padStickEls: {
    knob: HTMLElement;
    base: HTMLElement;
    s: (typeof PAD_STICKS)[number];
  }[] = [];
  private readonly padSampling = el('div', 'it-lines');
  private readonly padMapping = el('div', 'it-lines it-report');
  private readonly copyBtn = el('button', 'it-ctl', 'Copy report');
  private readonly resetBtn = el('button', 'it-ctl', 'Reset counters');
  private readonly copyBox = el('textarea', 'it-copy');
  private readonly copyNote = el('div', 'it-text');
  // The keyboard panel
  private readonly keyWrap = el('div', 'it-picwrap');
  private readonly keyPic = el('div', 'it-keys');
  private readonly keyEls = new Map<string, HTMLElement>();
  private readonly keyInfo = el('div', 'it-lines');
  // The touch panel
  private readonly ghost = el('div', 'it-ghost');
  private readonly ghostEls = new Map<ControlId, HTMLElement>();
  private readonly fingerLayer = el('div', 'it-fingers');
  private readonly fingerEls = new Map<number, HTMLElement>();
  private readonly touchInfo = el('div', 'it-lines');
  // The mouse panel
  private readonly mouseWrap = el('div', 'it-picwrap');
  private readonly mousePic = el('div', 'it-mouse');
  private readonly mouseEls = new Map<number, HTMLElement>();
  private readonly mouseInfo = el('div', 'it-lines');

  private opened = false;
  private t0 = 0;
  private shown: TestDevice = 'keyboard';
  private follow = true;
  private view: View = 'pad';
  private pinnedPad = -1;
  private readonly log = new Ring<string>(LOG_KEPT);
  private logDirty = true;
  private readonly keysLit = new LitTracker();
  private readonly padLit = new LitTracker();
  private readonly padTracker = new PadTracker();
  private readonly touch = new TouchProbe();
  private readonly sampling = new SamplingProbe();
  private readonly escHold = new HoldToLeave();
  private readonly padHold = new HoldToLeave();
  private snaps: (PadSnap | null)[] = [];
  private unKey: (() => void) | null = null;
  private timer = 0;
  private lastKey = '';
  private wheel: { dir: string; at: number } | null = null;
  private mouse = { x: 0, y: 0, buttons: new Set<number>(), seen: false };
  private lastKeyCode = '';
  private sizeKey = '';
  /** The window or the view changed: size the pictures again once the panel shows. */
  private relayout = false;
  private ghostKey = '';
  private lastPlaced: { hit: TouchLayout; face: Record<ControlId, Circle> } | null = null;

  constructor(private readonly h: InputTestHost) {
    const r = this.root;
    r.id = 'inputTest';
    r.hidden = true;
    r.setAttribute('role', 'region');
    r.setAttribute('aria-label', 'Input test');

    const head = el('div', 'it-head');
    const back = el('button', 'it-ctl it-back', 'Back');
    back.addEventListener('click', () => this.h.leave());
    const title = el('b', '', 'Input test');
    const tabs = el('div', 'it-row');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of DEVICES) {
      const b = el('button', 'it-ctl', label);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => {
        this.follow = false;
        this.show(id);
      });
      this.tabs.set(id, b);
      tabs.append(b);
    }
    this.auto.addEventListener('click', () => {
      this.follow = !this.follow;
      this.syncTabs();
    });
    tabs.append(this.auto);
    head.append(back, title, tabs);

    this.holdBar.append(this.holdFill);
    this.holdBar.setAttribute('aria-hidden', 'true');

    const main = el('div', 'it-main');
    const stage = el('div', 'it-stage');
    stage.append(this.buildPad(), this.buildKeyboard(), this.buildTouch(), this.buildMouse());
    const side = el('div', 'it-side');
    this.logBox.setAttribute('role', 'log');
    this.logBox.setAttribute('aria-label', 'Input log');
    side.append(this.logBox);
    main.append(stage, side);

    this.strip.setAttribute('role', 'group');
    this.strip.setAttribute('aria-label', 'Input word the game receives');
    for (const name of STRIP_NAMES) {
      const c = el('span', 'it-chip', name);
      c.dataset['on'] = '0';
      this.chips.set(name, c);
      this.strip.append(c);
    }

    r.append(head, this.leaveNote, this.holdBar, main, this.strip, this.ghost, this.fingerLayer);
    this.ghost.hidden = true;
    for (const id of ['dpad', 'jump', 'pogo', 'fire', 'pause'] as const) {
      const g = el('div', 'it-ghost-c');
      g.append(el('span', '', CONTROL_NAMES[id]));
      g.setAttribute('aria-label', CONTROL_NAMES[id]);
      g.title = CONTROL_NAMES[id];
      this.ghostEls.set(id, g);
      this.ghost.append(g);
    }

    r.addEventListener('pointerdown', this.onDown);
    r.addEventListener('pointermove', this.onMove);
    r.addEventListener('pointerup', this.onUp);
    r.addEventListener('pointercancel', this.onCancel);
    r.addEventListener('wheel', this.onWheel, { passive: false });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    this.copyBtn.addEventListener('click', () => void this.copyReport());
    this.resetBtn.addEventListener('click', () => this.sampling.reset());
    this.show('keyboard');
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** Opens the page: the log starts empty, the fast timer runs, and keys are read from the input manager. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.t0 = performance.now();
    this.log.clear();
    this.logDirty = true;
    this.keysLit.clear();
    this.padLit.clear();
    this.touch.cancelAll();
    this.sampling.clear();
    this.escHold.reset();
    this.padHold.reset();
    this.follow = true;
    this.pinnedPad = -1;
    this.view = 'pad';
    this.copyBox.hidden = true;
    setText(this.copyNote, '');
    this.mouse = { x: 0, y: 0, buttons: new Set(), seen: false };
    this.wheel = null;
    this.lastKeyCode = '';
    this.sizeKey = '';
    this.root.hidden = false;
    this.h.mount(this.root);
    this.touch.setLayout(this.h.placed().hit);
    this.show(this.deviceOf(this.h.input.device));
    this.unKey = this.h.input.onRawKey((e) => this.onKey(e));
    // The fast read: it sees what changes between two reads of the game. It only measures.
    this.timer = window.setInterval(() => this.fastRead(), 4);
    this.render(performance.now());
  }

  /** Closes the page and forgets everything it saw. */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    window.clearInterval(this.timer);
    this.unKey?.();
    this.unKey = null;
    this.root.remove();
    this.root.hidden = true;
    this.log.clear();
    this.keysLit.clear();
    this.padLit.clear();
    this.touch.cancelAll();
    this.sampling.clear();
    this.fingerEls.clear();
    this.fingerLayer.replaceChildren();
    this.snaps = [];
  }

  private deviceOf(d: InputDevice): TestDevice {
    return d === 'gamepad' ? 'gamepad' : d === 'touch' ? 'touch' : 'keyboard';
  }

  private ctx(): DescribeContext {
    return {
      bindings: this.h.input.bindings,
      pad: (i) => {
        const s = this.snaps[i];
        return { family: this.h.family(), standard: s ? isStandard(s) : true };
      },
      layout: this.h.layout(),
    };
  }

  /** Writes an event to the log and follows its device. */
  private record(e: RawEvent, now: number): void {
    this.log.push(logLine(now - this.t0, e, this.ctx()));
    this.logDirty = true;
    if (this.follow) {
      const d = eventDevice(e);
      if (d !== this.shown) this.show(d);
    }
  }

  private onKey(e: {
    type: 'down' | 'up' | 'blur';
    code: string;
    key: string;
    repeat: boolean;
  }): boolean {
    const now = performance.now();
    if (e.type === 'blur') {
      for (const c of [...this.keysLit.held]) this.keysLit.release(c, now);
      return false;
    }
    if (e.type === 'down') {
      if (e.repeat) return true;
      this.keysLit.press(e.code);
      this.lastKeyCode = e.code;
      this.record({ kind: 'key', code: e.code, key: e.key, down: true }, now);
    } else {
      this.keysLit.release(e.code, now);
      this.record({ kind: 'key', code: e.code, key: e.key, down: false }, now);
    }
    return true;
  }

  // ---------- Pointers ----------

  /** A pointer event on the page's own controls is not a test. */
  private onControl(e: Event): boolean {
    return !!(e.target as Element | null)?.closest?.('button, textarea');
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.onControl(e)) return;
    const now = performance.now();
    if (e.pointerType === 'touch') {
      this.h.input.noteTouch();
      const f = this.touch.press(e.pointerId, e.clientX, e.clientY, now);
      this.record(
        {
          kind: 'touch',
          id: e.pointerId,
          phase: 'down',
          x: f.x,
          y: f.y,
          control: f.control,
          actions: f.actions,
        },
        now,
      );
      try {
        this.root.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that is already gone has nothing to capture.
      }
    } else {
      this.mouse.seen = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.buttons.add(e.button);
      this.record({ kind: 'mouse', button: e.button, down: true, x: e.clientX, y: e.clientY }, now);
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touch.move(e.pointerId, e.clientX, e.clientY);
    } else {
      this.mouse.seen = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const now = performance.now();
    if (e.pointerType === 'touch') {
      const f = this.touch.lift(e.pointerId);
      if (f)
        this.record(
          {
            kind: 'touch',
            id: e.pointerId,
            phase: 'up',
            x: e.clientX,
            y: e.clientY,
            control: f.control,
            actions: f.actions,
          },
          now,
        );
    } else if (this.mouse.buttons.delete(e.button)) {
      this.record(
        { kind: 'mouse', button: e.button, down: false, x: e.clientX, y: e.clientY },
        now,
      );
    }
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touch.lift(e.pointerId);
    else this.mouse.buttons.clear();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    // The long Mapping report scrolls with the wheel.
    if ((e.target as Element | null)?.closest('.it-report')) return;
    e.preventDefault();
    const dir =
      Math.abs(e.deltaY) >= Math.abs(e.deltaX)
        ? e.deltaY < 0
          ? 'up'
          : 'down'
        : e.deltaX < 0
          ? 'left'
          : 'right';
    const now = performance.now();
    this.wheel = { dir, at: now };
    this.record({ kind: 'wheel', dir }, now);
  };

  // ---------- Reading ----------

  private fastRead(): void {
    const pads = this.h.input.pads();
    const now = performance.now();
    this.sampling.fast(
      now,
      pads.flatMap((p) =>
        p
          ? [{ index: p.index, timestamp: p.timestamp, pressed: p.buttons.map((b) => b.pressed) }]
          : [],
      ),
    );
  }

  /** One frame of the game: reads the pads (the game's own read), updates what is lit and redraws what changed. */
  frame(now: number): void {
    if (!this.opened) return;
    const snaps: (PadSnap | null)[] = [];
    for (const p of this.h.input.pads()) if (p) snaps[p.index] = snapPad(p);
    this.snaps = snaps;
    for (const e of this.padTracker.update(snaps)) this.record(e, now);
    this.sampling.tick(
      now,
      snaps.flatMap((s) => (s ? [sampleOf(s)] : [])),
    );
    const pad = this.selectedPad();
    if (pad) {
      pad.buttons.forEach((b, i) => {
        if (b.pressed) this.padLit.press(`${pad.index}:${i}`);
        else this.padLit.release(`${pad.index}:${i}`, now);
      });
    }
    // Holding Esc, or the pad's Back button, leaves. A short press only lights up.
    const esc = this.escHold.update(now, this.keysLit.held.has('Escape'));
    const back = this.padHold.update(
      now,
      snaps.some((s) => !!s && backHeld(s, this.h.input.bindings)),
    );
    const progress = Math.max(esc.progress, back.progress);
    this.holdBar.dataset['on'] = progress > 0 ? '1' : '0';
    this.holdFill.style.width = `${Math.round(progress * 100)}%`;
    this.render(now);
    if (esc.leave || back.leave) this.h.leave();
  }

  private selectedPad(): PadSnap | null {
    const pinned = this.pinnedPad >= 0 ? this.snaps[this.pinnedPad] : null;
    if (pinned) return pinned;
    const last = this.padTracker.lastMoved >= 0 ? this.snaps[this.padTracker.lastMoved] : null;
    return last ?? this.snaps.find((s) => !!s) ?? null;
  }

  /** The bits the game receives right now: its own merged read, plus the touch the page runs itself (the game's touch controls are hidden here). */
  private word(now: number): { bits: number; pause: boolean } {
    let bits = this.h.input.peek() | this.touch.bits(now);
    if (this.keysLit.held.has('Enter')) bits |= Input.CONFIRM;
    const b = this.h.input.bindings;
    const pause =
      [...this.keysLit.held].some((c) => keyActions(c).includes(PAUSE_NAME)) ||
      this.snaps.some((s) => !!s && b.pause.some((i) => !!s.buttons[i]?.pressed)) ||
      this.touch.pauseHeld;
    return { bits, pause };
  }

  // ---------- Drawing ----------

  private show(d: TestDevice): void {
    this.shown = d;
    for (const [id, p] of this.panels) p.hidden = id !== d;
    this.ghost.hidden = d !== 'touch';
    this.root.dataset['dev'] = d;
    // The ghost labels are measured once the layer shows.
    this.ghostKey = '';
    this.fingerLayer.hidden = d !== 'touch';
    this.syncTabs();
    this.sizeKey = '';
  }

  private syncTabs(): void {
    for (const [id, b] of this.tabs) {
      b.setAttribute('aria-selected', String(id === this.shown));
    }
    this.auto.setAttribute('aria-pressed', String(this.follow));
    this.auto.title = 'Follow the last device used';
  }

  private render(now: number): void {
    const reduced = this.h.reduced();
    this.root.dataset['rm'] = reduced ? '1' : '0';
    this.drawLeaveNote();
    const { bits, pause } = this.word(now);
    for (const w of WORD) this.chip(w.name, (bits & w.bit) !== 0);
    this.chip(PAUSE_NAME, pause);
    if (this.logDirty) this.drawLog();
    const placed = this.h.placed();
    const key = `${innerWidth}x${innerHeight}:${this.shown}:${this.view}`;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      this.lastPlaced = placed;
      this.touch.setLayout(placed.hit);
      this.relayout = true;
    }
    this.reserveForPause(placed);
    if (this.shown === 'gamepad') this.drawPad(now, reduced);
    else if (this.shown === 'keyboard') this.drawKeyboard(now, reduced);
    else if (this.shown === 'touch') this.drawTouch();
    else this.drawMouse(now);
  }

  /** On the Touch panel the header leaves room for the Pause control's hit area, which sits in the top corner and must stay touchable. */
  private reserveForPause(placed: { hit: TouchLayout }): void {
    let pr = 0;
    if (this.shown === 'touch') {
      const b = boxOf(placed.hit.pause);
      if (b.y < 120) pr = Math.max(0, innerWidth - b.x + 8);
    }
    const v = `${Math.round(pr)}px`;
    if (this.root.style.getPropertyValue('--it-pr') !== v)
      this.root.style.setProperty('--it-pr', v);
  }

  private chip(name: string, on: boolean): void {
    const c = this.chips.get(name);
    const v = on ? '1' : '0';
    if (c && c.dataset['on'] !== v) {
      c.dataset['on'] = v;
      c.setAttribute('aria-pressed', String(on));
    }
  }

  private drawLeaveNote(): void {
    const dev = this.h.input.device;
    const b = this.h.input.bindings;
    const lead =
      dev === 'touch'
        ? 'Tap Back to leave.'
        : dev === 'gamepad'
          ? `Hold ${padActionToken(b, 'pogo', this.h.family())} for 1 second to leave, or click Back.`
          : 'Hold {Esc} for 1 second to leave, or click Back.';
    const key = `${dev}|${lead}`;
    if (this.leaveNote.dataset['key'] === key) return;
    this.leaveNote.dataset['key'] = key;
    this.leaveNote.replaceChildren(
      document.createTextNode(hintText(lead)),
      el('span', 'it-opt', ' A short press only lights up.'),
    );
  }

  private drawLog(): void {
    this.logDirty = false;
    const lines = this.log.items.slice(-LOG_SHOWN);
    const nodes = lines.map((l) => el('div', 'it-line', l));
    if (nodes.length === 0)
      nodes.push(el('div', 'it-line it-dim', 'Press a key or a button, or touch the screen.'));
    this.logBox.replaceChildren(...nodes);
  }

  // ---------- Gamepad ----------

  private buildPad(): HTMLElement {
    const p = el('section', 'it-panel');
    p.dataset['device'] = 'gamepad';
    this.panels.set('gamepad', p);
    const views = el('div', 'it-row');
    for (const [id, label] of VIEWS) {
      const b = el('button', 'it-ctl', label);
      b.addEventListener('click', () => {
        this.view = id;
        this.sizeKey = '';
        this.copyBox.hidden = true;
      });
      this.padViews.set(id, b);
      views.append(b);
    }
    this.padPic.append(...PAD_PARTS.map((part) => this.padPart(part)));
    for (const s of PAD_STICKS) {
      const base = el('div', 'it-stick');
      const knob = el('div', 'it-knob');
      base.append(knob);
      this.padPic.append(base);
      this.padStickEls.push({ base, knob, s });
      this.padPartEls.set(s.click, knob);
    }
    this.padWrap.append(this.padPic, this.padGeneric);
    this.padMapping.setAttribute('aria-live', 'off');
    this.copyBox.readOnly = true;
    this.copyBox.hidden = true;
    this.copyBox.setAttribute('aria-label', 'Report text');
    const actions = el('div', 'it-row');
    actions.append(this.copyBtn);
    const sampActions = el('div', 'it-row');
    sampActions.append(this.resetBtn);
    p.append(
      views,
      this.padPick,
      this.padNone,
      this.padWrap,
      this.padInfo,
      this.padSampling,
      sampActions,
      this.padMapping,
      actions,
      this.copyBox,
      this.copyNote,
    );
    return p;
  }

  private padPart(part: (typeof PAD_PARTS)[number]): HTMLElement {
    const e = el('div', `it-part it-${part.kind}`);
    e.dataset['b'] = String(part.button);
    const label = part.label || PAD_LABELS[part.button] || '';
    if (label) e.dataset['label'] = label;
    if (part.kind === 'trigger') e.append(el('i'));
    this.padPartEls.set(part.button, e);
    return e;
  }

  private sizePictures(): void {
    if (!this.relayout) return;
    this.relayout = false;
    this.layoutPictures();
  }

  /** Sizes the pad, keyboard and mouse pictures from the room their panel has, in whole pixels per grid unit. */
  private layoutPictures(): void {
    const pw = this.panels.get('gamepad')?.clientWidth ?? 0;
    const ph = this.padWrap.clientHeight;
    const u = clamp(Math.floor(Math.min(pw / PAD_UNITS.w, (ph || 9999) / PAD_UNITS.h)), 2, 7);
    this.padPic.style.setProperty('--u', `${u}px`);
    this.padPic.style.width = px(PAD_UNITS.w * u);
    this.padPic.style.height = px(PAD_UNITS.h * u);
    for (const part of PAD_PARTS) {
      const e = this.padPartEls.get(part.button);
      if (!e) continue;
      Object.assign(e.style, {
        left: px(part.x * u),
        top: px(part.y * u),
        width: px(part.w * u),
        height: px(part.h * u),
      });
      // The glyph is a whole Fizz cell tall: it shows only where the part is big enough for it.
      const label = e.dataset['label'] ?? '';
      const cell = 11 * 2 + 4;
      const fits =
        label && part.h * u >= cell && part.w * u >= cell + (part.kind === 'face' ? 0 : 20);
      e.textContent = fits ? hintText(label) : '';
    }
    for (const { base, knob, s } of this.padStickEls) {
      Object.assign(base.style, {
        left: px((s.cx - s.r) * u),
        top: px((s.cy - s.r) * u),
        width: px(s.r * 2 * u),
        height: px(s.r * 2 * u),
      });
      const d = Math.round(s.r * 1.2 * u);
      Object.assign(knob.style, {
        width: px(d),
        height: px(d),
        left: px((s.r * 2 * u - d) / 2),
        top: px((s.r * 2 * u - d) / 2),
      });
    }
    this.layoutKeys();
    this.layoutMouse();
  }

  private drawPad(now: number, reduced: boolean): void {
    const pad = this.selectedPad();
    const connected = this.snaps.filter((s): s is PadSnap => !!s);
    // Pad picker: only when more than one pad is connected.
    const pickKey = connected.map((s) => s.index).join(',') + `:${pad?.index ?? -1}`;
    if (this.padPick.dataset['key'] !== pickKey) {
      this.padPick.dataset['key'] = pickKey;
      this.padPick.hidden = connected.length < 2;
      this.padPick.replaceChildren(
        ...connected.map((s) => {
          const b = el('button', 'it-ctl', `Pad ${s.index}`);
          b.setAttribute('aria-pressed', String(s.index === pad?.index));
          b.addEventListener('click', () => {
            this.pinnedPad = s.index;
          });
          return b;
        }),
      );
    }
    for (const [id, b] of this.padViews) b.setAttribute('aria-pressed', String(id === this.view));
    const none = !pad;
    this.padNone.hidden = !none;
    setText(
      this.padNone,
      'No controller found. Press a button on it; a browser shows a pad only after that.',
    );
    const standard = !!pad && isStandard(pad);
    this.padWrap.hidden = none || this.view !== 'pad';
    this.padPic.hidden = !standard;
    this.padGeneric.hidden = standard;
    this.padInfo.hidden = none || this.view !== 'pad';
    this.padSampling.hidden = none || this.view !== 'sampling';
    this.resetBtn.parentElement!.hidden = this.padSampling.hidden;
    this.padMapping.hidden = none || this.view !== 'mapping';
    this.copyBtn.parentElement!.hidden = this.padMapping.hidden;
    this.copyBox.hidden = this.copyBox.hidden || this.padMapping.hidden;
    this.sizePictures();
    if (!pad) return;
    const family = this.h.family();
    const b = this.h.input.bindings;
    if (this.view === 'pad') {
      if (standard) this.drawStandard(pad, now, reduced);
      else this.drawGeneric(pad, family);
      const held = pad.buttons.flatMap((x, i) => (x.pressed ? [i] : []));
      const names = held.map((i) => buttonLabel(i, standard, family));
      const actions = [
        ...new Set(
          held.flatMap((i) => padRows(pad, b, family).buttons[i]?.action.split(' (')[0] ?? []),
        ),
      ].filter((a) => a !== 'no action');
      const ax = pad.axes.map((v) => v.toFixed(2));
      const lines = [
        `Held ${names.length ? names.join(', ') : 'nothing'}  -> ${actionText(actions)}`,
        `Axes ${ax.join('  ')}`,
        padLine(pad),
        `${standard ? 'standard mapping' : `mapping "${pad.mapping}" (not standard)`}, ${pad.buttons.length} buttons, ${pad.axes.length} axes`,
      ];
      this.setLines(this.padInfo, lines, 2);
    } else if (this.view === 'sampling') {
      this.setLines(this.padSampling, [
        padLine(pad),
        ...samplingLines(this.sampling.report(pad.index, now)),
      ]);
    } else {
      this.setLines(this.padMapping, this.mappingLines(pad, now));
    }
  }

  private mappingLines(pad: PadSnap, now: number): string[] {
    return mappingReport(
      { host: this.h.hostName(), userAgent: navigator.userAgent },
      pad,
      this.h.input.bindings,
      this.h.family(),
      this.sampling.report(pad.index, now),
    );
  }

  private drawStandard(pad: PadSnap, now: number, reduced: boolean): void {
    for (const part of PAD_PARTS)
      this.light(this.padPartEls.get(part.button), `${pad.index}:${part.button}`, now, reduced);
    for (const { knob, s } of this.padStickEls) {
      const u = Number.parseFloat(this.padPic.style.getPropertyValue('--u')) || 3;
      const x = clamp(pad.axes[s.axisX] ?? 0, -1, 1);
      const y = clamp(pad.axes[s.axisY] ?? 0, -1, 1);
      const reach = s.r * 0.4 * u;
      knob.style.transform = `translate(${Math.round(x * reach)}px, ${Math.round(y * reach)}px)`;
      this.light(knob, `${pad.index}:${s.click}`, now, reduced);
    }
    for (const part of PAD_PARTS) {
      if (part.kind !== 'trigger') continue;
      const fill = this.padPartEls.get(part.button)?.firstElementChild as HTMLElement | null;
      const v = clamp(pad.buttons[part.button]?.value ?? 0, 0, 1);
      if (fill) fill.style.height = `${Math.round(v * 100)}%`;
    }
  }

  private light(e: HTMLElement | undefined, id: string, now: number, reduced: boolean): void {
    if (!e) return;
    const level = this.padLit.level(id, now, reduced);
    const s = level >= 1 ? 'on' : level > 0 ? 'fade' : 'off';
    if (e.dataset['s'] !== s) e.dataset['s'] = s;
    const v = level.toFixed(2);
    if (e.style.getPropertyValue('--lit') !== v) e.style.setProperty('--lit', v);
  }

  /** The generic panel: every raw button and axis by number, with the action the game gives it. */
  private drawGeneric(pad: PadSnap, family: PadFamily): void {
    const rows = padRows(pad, this.h.input.bindings, family);
    const key = `${pad.index}:${pad.buttons.length}:${pad.axes.length}`;
    if (this.padGeneric.dataset['key'] !== key) {
      this.padGeneric.dataset['key'] = key;
      this.padGeneric.replaceChildren(
        ...rows.buttons.map((b) => {
          const c = el('div', 'it-cell');
          c.dataset['b'] = String(b.index);
          c.append(el('span', '', String(b.index)), el('i'));
          return c;
        }),
        ...rows.axes.map((a) => {
          const c = el('div', 'it-axis');
          c.dataset['a'] = String(a.index);
          c.append(el('span', '', `a${a.index}`), el('i'), el('span', 'it-val'));
          return c;
        }),
      );
    }
    for (const c of this.padGeneric.querySelectorAll<HTMLElement>('.it-cell')) {
      const b = rows.buttons[Number(c.dataset['b'])];
      if (!b) continue;
      const s = b.pressed ? 'on' : 'off';
      if (c.dataset['s'] !== s) c.dataset['s'] = s;
      (c.lastElementChild as HTMLElement).style.height = `${Math.round(b.value * 100)}%`;
      c.title = `${b.label}: ${b.action}`;
    }
    for (const c of this.padGeneric.querySelectorAll<HTMLElement>('.it-axis')) {
      const a = rows.axes[Number(c.dataset['a'])];
      if (!a) continue;
      const fill = c.querySelector('i') as HTMLElement;
      const v = clamp(a.value, -1, 1);
      fill.style.left = `${Math.round(50 + Math.min(0, v) * 50)}%`;
      fill.style.width = `${Math.round(Math.abs(v) * 50)}%`;
      setText(c.querySelector('.it-val') as HTMLElement, a.value.toFixed(2));
    }
  }

  /** Writes lines into a box. Lines past `essential` are dropped on a small window (`it-opt`). */
  private setLines(into: HTMLElement, lines: readonly string[], essential = lines.length): void {
    const text = `${essential}|${lines.join('\n')}`;
    if (into.dataset['text'] === text) return;
    into.dataset['text'] = text;
    // A different number of lines changes the room the picture above has.
    if (into.childElementCount !== lines.length) this.relayout = true;
    into.replaceChildren(
      ...lines.map((l, i) => el('div', i < essential ? 'it-line' : 'it-line it-opt', l)),
    );
  }

  private async copyReport(): Promise<void> {
    const pad = this.selectedPad();
    const mapping = pad
      ? this.mappingLines(pad, performance.now())
      : mappingReport(
          { host: this.h.hostName(), userAgent: navigator.userAgent },
          null,
          this.h.input.bindings,
          this.h.family(),
          null,
        );
    const text = reportText(mapping, this.log.items);
    try {
      await navigator.clipboard.writeText(text);
      this.copyBox.hidden = true;
      setText(this.copyNote, 'Copied');
    } catch {
      // Where the browser will not copy, the text is shown selected, ready to copy by hand.
      this.copyBox.hidden = false;
      this.copyBox.value = text;
      this.copyBox.focus();
      this.copyBox.select();
      setText(this.copyNote, 'Select all and copy');
    }
  }

  // ---------- Keyboard ----------

  private buildKeyboard(): HTMLElement {
    const p = el('section', 'it-panel');
    p.dataset['device'] = 'keyboard';
    this.panels.set('keyboard', p);
    const { keys } = keyboardParts();
    for (const k of keys) {
      const e = el('div', 'it-key');
      e.dataset['code'] = k.code;
      this.keyEls.set(k.code, e);
      this.keyPic.append(e);
    }
    this.keyWrap.append(this.keyPic);
    p.append(this.keyWrap, this.keyInfo);
    return p;
  }

  private layoutKeys(): void {
    const { keys, w, h } = keyboardParts();
    const aw = this.panels.get('keyboard')?.clientWidth ?? 0;
    const ah = this.keyWrap.clientHeight || 9999;
    const k = clamp(Math.floor(Math.min(aw / w, ah / h)), 12, 52);
    this.keyPic.style.width = px(w * k);
    this.keyPic.style.height = px(h * k);
    for (const part of keys) {
      const e = this.keyEls.get(part.code);
      if (!e) continue;
      Object.assign(e.style, {
        left: px(part.x * k),
        top: px(part.y * k),
        width: px(part.w * k - 2),
        height: px(k - 2),
      });
      // A label is a Fizz glyph row twelve pixels wide per letter: it shows only where it fits.
      e.textContent = part.label.length * 12 + 4 <= part.w * k - 2 && k >= 24 ? part.label : '';
    }
  }

  private drawKeyboard(now: number, reduced: boolean): void {
    this.sizePictures();
    for (const [code, e] of this.keyEls) {
      const level = this.keysLit.level(code, now, reduced);
      const s = level >= 1 ? 'on' : level > 0 ? 'fade' : 'off';
      if (e.dataset['s'] !== s) e.dataset['s'] = s;
      const v = level.toFixed(2);
      if (e.style.getPropertyValue('--lit') !== v) e.style.setProperty('--lit', v);
    }
    const held = [...this.keysLit.held];
    const code = held[held.length - 1] ?? this.lastKeyCode;
    const lines: string[] = [];
    if (!code) {
      lines.push('Press any key. Keys the game does not use light up too.');
    } else {
      const actions = keyActions(code);
      const note = layoutNote(code, this.h.layout());
      lines.push(
        `${held.length ? 'Held' : 'Last'}  ${keyName(code)}  code ${code}`,
        `-> ${actionText(actions)}${note && actions.length ? ` (${note})` : ''}`,
      );
    }
    if (held.length > 1) lines.push(`Held now ${held.map(keyName).join(', ')}`);
    const essential = Math.min(2, lines.length);
    lines.push(
      `Controls layout ${this.h.layout() === 1 ? 'Modern' : 'Keen-style'} (both layouts work)`,
    );
    this.setLines(this.keyInfo, lines, essential);
  }

  // ---------- Touch ----------

  private buildTouch(): HTMLElement {
    const p = el('section', 'it-panel');
    p.dataset['device'] = 'touch';
    this.panels.set('touch', p);
    p.append(this.touchInfo);
    return p;
  }

  private drawTouch(): void {
    const placed = this.lastPlaced;
    // The ghosts are placed, and their labels fitted, only when the placement or the text size changes.
    const key = placed ? `${JSON.stringify(placed.hit)}@${innerHeight}` : '';
    if (placed && key !== this.ghostKey) {
      this.ghostKey = key;
      for (const [id, g] of this.ghostEls) {
        const b = boxOf(placed.hit[id]);
        Object.assign(g.style, {
          left: px(b.x),
          top: px(b.y),
          width: px(b.w),
          height: px(b.h),
          borderRadius: b.round ? '50%' : '8px',
        });
        // The full name when it fits inside the box (a circle has less room than its width), else a short form.
        const label = g.firstElementChild as HTMLElement;
        label.textContent = CONTROL_NAMES[id];
        const room = (b.round ? b.w * 0.75 : b.w) - 8;
        if (label.getBoundingClientRect().width > room) label.textContent = SHORT_NAMES[id];
      }
    }
    const fingers = this.touch.down;
    const seen = new Set<number>();
    for (const f of fingers) {
      seen.add(f.id);
      let m = this.fingerEls.get(f.id);
      if (!m) {
        m = el('div', 'it-finger');
        m.append(el('i'), el('span'));
        this.fingerEls.set(f.id, m);
        this.fingerLayer.append(m);
      }
      const landed = f.control !== null;
      m.dataset['hit'] = landed ? '1' : '0';
      m.style.left = px(f.x);
      m.style.top = px(f.y);
      m.dataset['side'] = f.x > innerWidth * 0.6 ? 'l' : 'r';
      setText(
        m.lastElementChild as HTMLElement,
        `#${f.id} ${landed ? CONTROL_NAMES[f.control as ControlId] : 'miss'}`,
      );
    }
    for (const [id, m] of this.fingerEls) {
      if (seen.has(id)) continue;
      m.remove();
      this.fingerEls.delete(id);
    }
    const lines =
      fingers.length === 0
        ? ['Touch the screen. The dashed shapes are where the game puts its controls.']
        : fingers.map(
            (f) =>
              `Finger ${f.id}  ${Math.round(f.x)},${Math.round(f.y)}  ${f.control ? `on ${CONTROL_NAMES[f.control]}` : 'miss (no control)'}  -> ${actionText(f.actions)}`,
          );
    this.setLines(this.touchInfo, lines);
  }

  // ---------- Mouse ----------

  private buildMouse(): HTMLElement {
    const p = el('section', 'it-panel');
    p.dataset['device'] = 'mouse';
    this.panels.set('mouse', p);
    for (const part of MOUSE_PARTS) {
      const e = el('div', 'it-mpart');
      this.mouseEls.set(part.button, e);
      this.mousePic.append(e);
    }
    const wheel = el('div', 'it-mwheel');
    this.mousePic.append(wheel);
    this.mouseEls.set(-1, wheel);
    this.mouseWrap.append(this.mousePic);
    p.append(this.mouseWrap, this.mouseInfo);
    return p;
  }

  private layoutMouse(): void {
    const aw = this.panels.get('mouse')?.clientWidth ?? 0;
    const ah = this.mouseWrap.clientHeight || 9999;
    const u = clamp(Math.floor(Math.min(aw / MOUSE_UNITS.w, ah / MOUSE_UNITS.h)), 4, 12);
    this.mousePic.style.width = px(MOUSE_UNITS.w * u);
    this.mousePic.style.height = px(MOUSE_UNITS.h * u);
    for (const part of MOUSE_PARTS) {
      const e = this.mouseEls.get(part.button);
      if (e)
        Object.assign(e.style, {
          left: px(part.x * u),
          top: px(part.y * u),
          width: px(part.w * u - 2),
          height: px(part.h * u - 2),
        });
    }
  }

  private drawMouse(now: number): void {
    this.sizePictures();
    for (const part of MOUSE_PARTS) {
      const e = this.mouseEls.get(part.button);
      const s = this.mouse.buttons.has(part.button) ? 'on' : 'off';
      if (e && e.dataset['s'] !== s) e.dataset['s'] = s;
    }
    const wheelOn = !!this.wheel && now - this.wheel.at < 600;
    const w = this.mouseEls.get(-1);
    if (w) {
      const s = wheelOn ? 'on' : 'off';
      if (w.dataset['s'] !== s) w.dataset['s'] = s;
      w.dataset['dir'] = this.wheel?.dir ?? '';
    }
    const held = [...this.mouse.buttons].map((b) => `${b} (${mouseButtonName(b)})`);
    this.setLines(
      this.mouseInfo,
      [
        this.mouse.seen
          ? `Position ${Math.round(this.mouse.x)},${Math.round(this.mouse.y)}`
          : 'Move or click the mouse.',
        `Buttons held ${held.length ? held.join(', ') : 'none'}`,
        `Wheel ${this.wheel ? this.wheel.dir : 'not used yet'}`,
        'The mouse has no action in the game apart from the wheel, which zooms.',
      ],
      2,
    );
  }
}
