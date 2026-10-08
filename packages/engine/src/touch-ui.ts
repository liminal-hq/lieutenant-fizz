// The on-screen touch controls: a thin DOM layer that feeds pointer events to `TouchState`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// All of the logic (hit areas, the sliding D-pad, the minimum hold, where things sit) lives in the pure
// `touch.ts` and `touch-layout.ts`, which are unit-tested. This file only creates the elements, turns
// pointer events into `down`, `move` and `up`, and shows what is held. The episode supplies the look
// (CSS) and the icons inside each face.

import type { InputManager } from './input';
import { contains, hitTest, type ControlId, type TouchLayout } from './touch';
import {
  DEFAULT_TOUCH_SPEC,
  dragOffset,
  placeControls,
  controlSide,
  sideGutters,
  sideTops,
  type SideTops,
  type EdgeOffset,
  type Gutters,
  type Insets,
  type MovableId,
  type PlacedControls,
  type TouchSpec,
} from './touch-layout';

type Arm = 'left' | 'right' | 'up' | 'down';
type PressButton = 'jump' | 'pogo' | 'fire';

const ARMS: readonly Arm[] = ['left', 'right', 'up', 'down'];
const ALL: readonly ControlId[] = ['dpad', 'jump', 'pogo', 'fire', 'pause'];
/** A hit area nothing can land on, for a control that is hidden. */
const NOWHERE = { cx: Number.NaN, cy: Number.NaN, r: 0 };
const BUTTONS: readonly Exclude<ControlId, 'dpad'>[] = ['jump', 'pogo', 'fire', 'pause'];

export interface TouchControlsOptions {
  /** The accessible name of each control. */
  labels: Record<ControlId, string>;
  spec?: TouchSpec;
}

/** What the editor hears while the player moves controls (haptics, saving). */
export interface EditHooks {
  /** A finger picked up a control. */
  pick?(id: MovableId): void;
  /** The finger lifted (or the drag was cut short): the control now sits at this offset. */
  drop(id: MovableId, off: EdgeOffset): void;
}

/** A control under a finger in edit mode, and how far its centre is from where the finger landed. */
interface Drag {
  pointerId: number;
  id: MovableId;
  dx: number;
  dy: number;
  /** The offset of its latest valid place, or null while it has not moved. */
  off: EdgeOffset | null;
}

const div = (cls: string): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  return e;
};

export class TouchControls {
  /** The placement the controls currently have, for tests and the episode's layout. */
  placed: PlacedControls | null = null;

  private readonly dpad = div('tc-dpad');
  private readonly arms = {} as Record<Arm, HTMLElement>;
  private readonly buttons = {} as Record<Exclude<ControlId, 'dpad'>, HTMLButtonElement>;
  private readonly faces = {} as Record<ControlId, HTMLElement>;
  private readonly count = document.createElement('span');
  private readonly probe = div('tc-probe');
  private spec: TouchSpec;
  private visible = false;
  private placementKey = '';
  private pausePointer: number | null = null;
  /** When set (on a menu), Jump and Pogo act on lift, so sliding off the button cancels the press. */
  private deferred = false;
  /** Fingers down on a button whose press waits for the lift. */
  private readonly pending = new Map<number, PressButton>();
  private heldKey = '';
  private lit = false;
  private shown: readonly ControlId[] = ALL;
  private editing = false;
  private hooks: EditHooks | null = null;
  private drag: Drag | null = null;
  /** The accessible name each control has outside the editor. */
  private readonly names: Record<ControlId, string>;

  constructor(
    private readonly layer: HTMLElement,
    private readonly input: InputManager,
    private readonly opts: TouchControlsOptions,
  ) {
    this.spec = opts.spec ?? DEFAULT_TOUCH_SPEC;
    this.names = { ...opts.labels };

    this.dpad.setAttribute('role', 'group');
    this.dpad.setAttribute('aria-label', opts.labels.dpad);
    this.dpad.dataset.control = 'dpad';
    const dpadFace = div('face');
    this.faces.dpad = dpadFace;
    for (const a of ARMS) {
      const arm = div('arm');
      arm.dataset.arm = a;
      this.arms[a] = arm;
      dpadFace.append(arm);
    }
    this.dpad.append(dpadFace);
    this.layer.append(this.dpad);

    for (const id of BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.control = id;
      b.setAttribute('aria-label', opts.labels[id]);
      // The game is played by touch; Tab and the keyboard keep their own controls.
      b.tabIndex = -1;
      const face = document.createElement('span');
      face.className = 'face';
      b.append(face);
      this.faces[id] = face;
      this.buttons[id] = b;
      this.layer.append(b);
    }
    this.buttons.pogo.setAttribute('aria-pressed', 'false');
    this.count.className = 'count';
    this.faces.fire.append(this.count);

    // A hidden element whose padding resolves to the safe-area insets, so they can be read in pixels.
    this.probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;inset:0;' +
      'padding:var(--lf-safe-top,env(safe-area-inset-top,0px)) ' +
      'var(--lf-safe-right,env(safe-area-inset-right,0px)) ' +
      'var(--lf-safe-bottom,env(safe-area-inset-bottom,0px)) ' +
      'var(--lf-safe-left,env(safe-area-inset-left,0px));box-sizing:border-box';
    this.layer.append(this.probe);

    this.layer.addEventListener('pointerdown', this.onDown);
    this.layer.addEventListener('pointermove', this.onMove);
    this.layer.addEventListener('pointerup', this.onUp);
    this.layer.addEventListener('pointercancel', this.onCancel);
    this.layer.addEventListener('lostpointercapture', this.onCancel);
    this.layer.addEventListener('click', this.onClick);
    this.layer.hidden = true;
  }

  /** The element inside a control where the episode puts its icon. */
  face(id: ControlId): HTMLElement {
    return this.faces[id];
  }

  /** Shows or hides the controls. Hiding releases every finger, so nothing stays held. */
  setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    this.layer.hidden = !on;
    if (on) {
      this.relayout();
    } else {
      this.endDrag(true);
      this.input.releaseTouch();
      this.clearPending();
      this.pausePointer = null;
      this.input.touch.layout = null;
    }
  }

  /** Lights the Pogo button while pogo is on. Writes only on a change. */
  setLit(on: boolean): void {
    if (on === this.lit) return;
    this.lit = on;
    this.buttons.pogo.classList.toggle('lit', on);
    this.buttons.pogo.setAttribute('aria-pressed', String(on));
  }

  /** Shows a number on the Fizz button (the ammo). Writes only on a change. */
  setCount(text: string): void {
    if (this.count.textContent !== text) this.count.textContent = text;
  }

  /** The spec the controls are placed with now. */
  get currentSpec(): TouchSpec {
    return this.spec;
  }

  /**
   * Changes the size, hand or moved controls. When the controls are showing they are placed again at
   * once, and a changed placement drops every held finger (see `relayout`); when hidden, the next
   * `setVisible(true)` places them. A button held through a step of the Size setting is released by the
   * change, so holding the arrow on a menu steps once.
   */
  setSpec(spec: TouchSpec): void {
    this.spec = spec;
    this.relayout();
  }

  /** Reads the window size and the safe-area insets and places every control. */
  relayout(): void {
    if (!this.visible) return;
    const w = this.layer.clientWidth || window.innerWidth;
    const h = this.layer.clientHeight || window.innerHeight;
    const placed = placeControls(w, h, this.readInsets(), this.spec);
    const key = JSON.stringify(placed);
    if (key !== this.placementKey) {
      // A window that changed under a drag would leave the finger on the wrong place, so the drag ends.
      this.endDrag(true);
      // A moved control would turn a held finger into a phantom direction, so start clean.
      if (this.placementKey) this.input.releaseTouch();
      this.clearPending();
      this.pausePointer = null;
      this.placementKey = key;
      this.apply(placed);
    }
    this.placed = placed;
    this.input.touch.layout = this.editing ? null : this.liveHits();
  }

  /**
   * Shows only these controls (menus use a reduced set). A hidden control takes no new touch, but a
   * finger already on it stays tracked until it lifts, so nothing is pressed or released by the change.
   */
  setShown(ids: readonly ControlId[]): void {
    if (ids.length === this.shown.length && ids.every((id, i) => this.shown[i] === id)) return;
    this.shown = [...ids];
    for (const id of ALL) {
      const el = id === 'dpad' ? this.dpad : this.buttons[id];
      el.hidden = !this.shown.includes(id);
    }
    if (this.drag && !this.shown.includes(this.drag.id)) this.endDrag(true);
    if (this.visible && this.placed)
      this.input.touch.layout = this.editing ? null : this.liveHits();
  }

  /** Changes a control's accessible name (Jump reads "Select" in a menu). */
  setName(id: ControlId, name: string): void {
    this.names[id] = name;
    this.label(id);
  }

  /** Writes a control's accessible name: "Move Jump" in the editor, else its own name. */
  private label(id: ControlId): void {
    const el = id === 'dpad' ? this.dpad : this.buttons[id];
    const name = this.editing && id !== 'pause' ? `Move ${this.names[id]}` : this.names[id];
    if (el.getAttribute('aria-label') !== name) el.setAttribute('aria-label', name);
  }

  /**
   * Turns the editor on or off. While it is on, a finger drags a control (the four movable ones) to a
   * new place instead of pressing it: the controls take no game or menu input, and each drop is passed
   * to `hooks.drop` as the offset to save. Entering drops every held finger.
   */
  setEditing(on: boolean, hooks?: EditHooks): void {
    if (on === this.editing) {
      if (on) this.hooks = hooks ?? null;
      return;
    }
    this.endDrag(true);
    this.hooks = on ? (hooks ?? null) : null;
    this.editing = on;
    if (on) {
      this.input.releaseTouch();
      this.clearPending();
      this.pausePointer = null;
      this.input.touch.layout = null;
    } else if (this.visible && this.placed) {
      this.input.touch.layout = this.liveHits();
    }
    for (const id of ALL) this.label(id);
  }

  /** The room menu content should leave on each side for the controls showing now (0 when hidden). */
  gutters(margin = 16): Gutters {
    if (!this.visible || !this.placed) return { left: 0, right: 0 };
    const w = this.layer.clientWidth || window.innerWidth;
    return sideGutters(this.placed, w, this.shown, margin);
  }

  /** Where content above the controls must stop on each side, for the controls showing now (0 for none). */
  tops(margin = 16): SideTops {
    if (!this.visible || !this.placed) return { left: 0, right: 0 };
    const w = this.layer.clientWidth || window.innerWidth;
    return sideTops(this.placed, w, this.shown, margin);
  }

  /** The hand the layout is for: `right` has the D-pad on the left, `left` has it on the right. */
  hand(): 'left' | 'right' {
    if (!this.placed) return 'right';
    const w = this.layer.clientWidth || window.innerWidth;
    return controlSide(this.placed, w, 'dpad') === 'left' ? 'right' : 'left';
  }

  /** The hit areas with every hidden control moved out of reach. */
  private liveHits(): TouchLayout | null {
    if (!this.placed) return null;
    const hit = { ...this.placed.hit };
    for (const id of ALL) if (!this.shown.includes(id)) hit[id] = NOWHERE;
    return hit;
  }

  /** Shows what is held: the pressed buttons and the D-pad arm under the thumb. Call once a frame. */
  frame(now: number): void {
    if (!this.visible) return;
    const h = this.input.touch.held(now);
    const key =
      ARMS.map((a) => (h[a] ? 1 : 0)).join('') +
      (h.jump ? 'j' : '') +
      (h.pogo ? 'p' : '') +
      (h.fire ? 'f' : '');
    if (key === this.heldKey) return;
    this.heldKey = key;
    for (const a of ARMS) {
      if (h[a]) this.arms[a].dataset.held = '';
      else delete this.arms[a].dataset.held;
    }
    this.buttons.jump.classList.toggle('on', h.jump);
    this.buttons.pogo.classList.toggle('on', h.pogo);
    this.buttons.fire.classList.toggle('on', h.fire);
  }

  dispose(): void {
    this.layer.removeEventListener('pointerdown', this.onDown);
    this.layer.removeEventListener('pointermove', this.onMove);
    this.layer.removeEventListener('pointerup', this.onUp);
    this.layer.removeEventListener('pointercancel', this.onCancel);
    this.layer.removeEventListener('lostpointercapture', this.onCancel);
    this.layer.removeEventListener('click', this.onClick);
    this.input.touch.layout = null;
  }

  private readInsets(): Insets {
    const cs = getComputedStyle(this.probe);
    const px = (v: string): number => Number.parseFloat(v) || 0;
    return {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
  }

  /** Puts each element where the placement says. The element is the hit area; the face is drawn inside. */
  private apply(p: PlacedControls): void {
    const at = (el: HTMLElement, id: ControlId): void => {
      const hit = p.hit[id];
      const face = p.face[id];
      const box =
        'r' in hit
          ? { x: hit.cx - hit.r, y: hit.cy - hit.r, w: hit.r * 2, h: hit.r * 2 }
          : { x: hit.x, y: hit.y, w: hit.w, h: hit.h };
      const s = el.style;
      s.left = `${box.x}px`;
      s.top = `${box.y}px`;
      s.width = `${box.w}px`;
      s.height = `${box.h}px`;
      s.setProperty('--face', `${face.r * 2}px`);
    };
    at(this.dpad, 'dpad');
    for (const id of BUTTONS) at(this.buttons[id], id);
  }

  private capture(e: PointerEvent): void {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; there is nothing to track.
    }
  }

  private dropPending(id: number): void {
    const b = this.pending.get(id);
    if (b) this.buttons[b].classList.remove('press');
    this.pending.delete(id);
  }

  /** Forgets every deferred press (the controls hid or moved, or the mode changed). */
  private clearPending(): void {
    for (const id of [...this.pending.keys()]) this.dropPending(id);
  }

  /** Makes Jump and Pogo act on lift (a menu) or on press (play). Switching drops any press in flight. */
  setDeferred(on: boolean): void {
    if (on === this.deferred) return;
    this.deferred = on;
    this.clearPending();
  }

  /** The layer's own pixel position of a pointer event. */
  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.layer.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.visible) return;
    // Never stopPropagation: the page's audio unlock listens for this same event.
    e.preventDefault();
    if (e.pointerType === 'touch') this.input.noteTouch();
    if (this.editing) {
      this.editDown(e);
      return;
    }
    const { x, y } = this.local(e);
    const layout = this.input.touch.layout;
    const target = layout ? hitTest(layout, x, y) : null;
    if (this.deferred && (target === 'jump' || target === 'pogo' || target === 'fire')) {
      // On a menu a button acts when the finger lifts inside it, like Pause, so it can be cancelled.
      this.capture(e);
      this.pending.set(e.pointerId, target);
      this.buttons[target].classList.add('press');
      return;
    }
    const control = this.input.touch.down(e.pointerId, x, y, performance.now());
    if (!control) return;
    this.capture(e);
    if (control === 'pause') this.pausePointer = e.pointerId;
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.visible) return;
    if (this.editing) {
      this.editMove(e);
      return;
    }
    const { x, y } = this.local(e);
    this.input.touch.move(e.pointerId, x, y);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.editing) {
      this.editEnd(e);
      return;
    }
    this.input.touch.up(e.pointerId);
    const pressed = this.pending.get(e.pointerId);
    if (pressed) {
      this.pending.delete(e.pointerId);
      this.buttons[pressed].classList.remove('press');
      const { x, y } = this.local(e);
      if (this.placed && contains(this.placed.hit[pressed], x, y)) {
        this.input.touch.tap(pressed, performance.now());
      }
      return;
    }
    if (e.pointerId !== this.pausePointer) return;
    this.pausePointer = null;
    // Pause runs on release inside its hit area, so sliding off cancels it and the finger never lands
    // on the pause menu that opens.
    const { x, y } = this.local(e);
    if (this.placed && contains(this.placed.hit.pause, x, y)) this.input.command({ type: 'pause' });
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (this.editing) {
      this.editEnd(e);
      return;
    }
    this.input.touch.up(e.pointerId);
    this.dropPending(e.pointerId);
    if (e.pointerId === this.pausePointer) this.pausePointer = null;
  };

  /** The movable controls showing now, as hit areas a new finger can land on. */
  private editHits(): TouchLayout | null {
    if (!this.placed) return null;
    const hit = { ...this.placed.hit };
    for (const id of ALL) if (id === 'pause' || !this.shown.includes(id)) hit[id] = NOWHERE;
    return hit;
  }

  /** A finger lands on a control: it is picked up with the finger where it is, so nothing jumps. */
  private editDown(e: PointerEvent): void {
    if (this.drag || !this.placed) return;
    const hits = this.editHits();
    const { x, y } = this.local(e);
    const id = hits ? hitTest(hits, x, y) : null;
    if (!id || id === 'pause') return;
    const face = this.placed.face[id];
    this.drag = { pointerId: e.pointerId, id, dx: face.cx - x, dy: face.cy - y, off: null };
    this.capture(e);
    const el = id === 'dpad' ? this.dpad : this.buttons[id];
    el.classList.add('drag');
    this.hooks?.pick?.(id);
  }

  /** The finger moves: the control follows it, kept in its zone and off the other controls. */
  private editMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId || !this.placed) return;
    const { x, y } = this.local(e);
    const { w, h } = this.size();
    const insets = this.readInsets();
    const off = dragOffset(
      this.placed,
      d.id,
      { cx: x + d.dx, cy: y + d.dy },
      w,
      h,
      insets,
      this.spec,
    );
    if (!off) return;
    d.off = off;
    this.spec = { ...this.spec, moved: { ...this.spec.moved, [d.id]: off } };
    const placed = placeControls(w, h, insets, this.spec);
    this.placementKey = JSON.stringify(placed);
    this.placed = placed;
    this.apply(placed);
  }

  /** The finger lifts or the system takes it: the control stays where it is and is reported. */
  private editEnd(e: PointerEvent): void {
    if (this.drag && this.drag.pointerId === e.pointerId) this.endDrag(true);
  }

  /** Ends a drag. A control that moved is reported to `drop`; one that never moved is not. */
  private endDrag(report: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const el = d.id === 'dpad' ? this.dpad : this.buttons[d.id];
    el.classList.remove('drag');
    if (report && d.off) this.hooks?.drop(d.id, d.off);
  }

  private size(): { w: number; h: number } {
    return {
      w: this.layer.clientWidth || window.innerWidth,
      h: this.layer.clientHeight || window.innerHeight,
    };
  }

  /** A click with no pointer (`detail` 0) is an assistive technology activating the button. */
  private readonly onClick = (e: MouseEvent): void => {
    if (e.detail !== 0 || !this.visible || this.editing) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-control]');
    const id = el?.dataset.control as ControlId | undefined;
    if (!id || id === 'dpad' || !this.placed || !this.shown.includes(id)) return;
    if (id === 'pause') {
      this.input.command({ type: 'pause' });
      return;
    }
    // A tap on a game button: press it where its centre is, and let the minimum hold carry it.
    const c = this.placed.face[id as PressButton];
    this.input.touch.down(-1, c.cx, c.cy, performance.now());
    this.input.touch.up(-1);
  };
}
