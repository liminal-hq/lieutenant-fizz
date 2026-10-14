// The replay screen in the game: a sim of its own re-runs a saved sample, with a bar, layers and sound.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import {
  COLOURS,
  drawControls,
  drawCross,
  drawFinger,
  drawDot,
  drawPolyline,
  drawTrace,
  drawRing,
  shiftedColour,
  toScreen,
  type Ctx2D,
  type WorldView,
} from '@lieutenant-fizz/engine/replay/overlay';
import { Transport } from '@lieutenant-fizz/engine/replay/transport';
import type { Session } from '@lieutenant-fizz/engine/session/log';
import { drawSimFrame, renderSim, type RenderOptions, type SimFrame } from '../sim/draw';
import { Ev, Input, State } from '../sim/protocol';
import type { Sim } from '../sim/sim';
import { dwells } from './attempts';
import { INPUT_BITS } from './names';
import {
  DEATH_LEAD,
  SKIP_TICKS,
  clockText,
  deathTargets,
  driftText,
  inputText,
  nextTarget,
} from './navigation';
import { findAttempts, Replayer, type ReplayAttempt } from './replayer';
import { markersOf, type Marker } from './timeline';
import { fingersAt, layoutAt, touchesOf, type Touch, type TouchLayoutAt } from './touches';

/** What the replay needs from the game. The game owns the sound, the renderer and the screen it sits on. */
export interface ReplayHostDeps {
  /** A sim of its own, with the sprite table filled in. Never the player's live one. */
  sim: Sim;
  session: Session;
  renderer: InstancedRenderer;
  /** Where the layer canvas goes (the same box as the renderer's canvas) and where the bar and text go. */
  gl: HTMLElement;
  mount: (node: HTMLElement) => void;
  drawOptions: () => RenderOptions & { normals: boolean; poster: boolean };
  /** Plays a caption's sound the way the game would, from where it was raised. */
  playCaption: (id: number, x: number, y: number, cam: { x: number; y: number }) => void;
  /** A caption's words, for the line of what just happened. */
  captionText: (id: number) => string;
  onClose: () => void;
  /** Opens held at the start of the first try, for a screen that wants to begin there (a test does). */
  paused?: boolean;
  /**
   * The buttons held when it opens. The press that chose Watch may still be down while the replay loads, and it
   * is not a press in the replay, so only a button let go and pressed again counts.
   */
  held?: number;
  /** Layers of the host's own (the viewer's hot spots), switched on and off from the same sheet. */
  extraLayers?: ExtraLayer[];
}

/** A layer a host adds: a name for the sheet, whether it starts on, and how it draws. */
export interface ExtraLayer {
  id: string;
  label: string;
  on: boolean;
  /** Draws on the replay's canvas in canvas pixels; `view` maps tiles to them. */
  draw: (
    ctx: Ctx2D & CanvasRenderingContext2D,
    view: WorldView,
    now: { attempt: ReplayAttempt; tick: number },
  ) => void;
}

/** The layers that can be switched on and off. */
export /** What the transport buttons show: Fizz font glyphs, which common system fonts also have in some shape. */
const ICONS = {
  play: '\u25BA',
  pause: '\u2016',
  lastTry: '|\u25C4',
  nextTry: '\u25BA|',
  lastDeath: '\u25C4\u2620',
  nextDeath: '\u2620\u25BA',
} as const;

const LAYERS = [
  ['touch', 'Touches'],
  ['path', 'Path'],
  ['fizz', 'Fizz shots'],
  ['stays', 'Stays'],
  ['deaths', 'Deaths'],
  ['others', 'Other tries'],
  ['input', 'Buttons'],
  ['sound', 'Sound'],
] as const;
export type LayerId = (typeof LAYERS)[number][0];

/** Whether a session has anything to replay: an attempt with a level start and an entry state. */
export function canReplay(session: Session): boolean {
  return findAttempts(session).some((a) => a.entry !== null);
}

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
};

/** How long the bar stays after the last touch or key while playing, in milliseconds. */
const BAR_MS = 3000;
/** How often the words and the scrub bar are refreshed, in milliseconds. */
const TEXT_MS = 100;

/**
 * The replay screen. It re-runs one attempt at a time on its own sim with the sample's inputs, draws it on the
 * game's renderer, and lays the layers over it. It writes nothing: no progress, no new sample, no settings.
 */
export class ReplayHost {
  private readonly replayer: Replayer;
  private readonly transport = new Transport();
  private readonly layers: Record<string, boolean>;
  private readonly playable: number[];
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly bar: HTMLElement;
  private readonly info: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly scrub: HTMLInputElement;
  private readonly clock: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly layerBtns = new Map<string, HTMLButtonElement>();
  /** What to say about this sample before it plays: a different build, a level edited since. */
  private notes: string[] = [];
  private buildNote = '';
  private readonly sheet: HTMLElement;

  private at = 0;
  private touches: Touch[] = [];
  private markers: Marker[] = [];
  private targets: number[] = [];
  private layout: TouchLayoutAt | null = null;
  private lastBits = 0;
  private lastText = 0;
  private lastAct = performance.now();
  /** Whether the player tapped the bar away; it stays away until the next tap or key. */
  private hidden = false;
  private dragging = false;
  private said = '';
  private bannerFor: string | null = null;
  private closed = false;

  constructor(private readonly d: ReplayHostDeps) {
    this.lastBits = d.held ?? 0;
    this.replayer = new Replayer(d.sim, d.session);
    this.playable = this.replayer.attempts.map((a, i) => (a.entry ? i : -1)).filter((i) => i >= 0);
    if (this.playable.length === 0) throw new Error('nothing in this sample can be replayed');
    const touchMode = d.session.specs['touchMode'] === true;
    this.layers = {
      touch: touchMode,
      path: true,
      fizz: true,
      stays: false,
      deaths: true,
      others: false,
      input: !touchMode,
      sound: true,
    };
    for (const x of d.extraLayers ?? []) this.layers[x.id] = x.on;
    // A sample made on another build of the game may not replay as it played: say so before it plays.
    const built = d.session.specs['sim'];
    this.buildNote =
      typeof built === 'string' && built !== d.sim.wasmCrc
        ? 'This sample was recorded on a different build of the game, so it may not match.'
        : '';

    this.canvas = h('canvas', { 'aria-hidden': 'true', class: 'replay-layers' });
    this.info = h('div', { class: 'replay-info lf lf-panel', 'aria-live': 'off' });
    this.banner = h('div', { class: 'replay-banner lf lf-panel', role: 'status', hidden: '' });
    this.scrub = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '1',
      value: '0',
      'aria-label': 'Position in this try',
      class: 'replay-scrub',
    });
    this.clock = h('span', { class: 'replay-clock' });
    this.playBtn = this.button('Play', () => this.togglePlay(), 'replay-play', ICONS.play);
    this.speedBtn = this.button('1x', () => this.cycleSpeed(), 'replay-speed');
    this.sheet = h('div', { class: 'replay-sheet', hidden: '' });
    for (const [id, label] of LAYERS) {
      const b = this.button(label, () => this.toggleLayer(id), 'replay-layer');
      b.setAttribute('aria-pressed', String(this.layers[id]));
      this.layerBtns.set(id, b);
      this.sheet.append(b);
    }
    for (const x of d.extraLayers ?? []) {
      const b = this.button(x.label, () => this.toggleLayer(x.id), 'replay-layer');
      b.setAttribute('aria-pressed', String(this.layers[x.id]));
      this.layerBtns.set(x.id, b);
      this.sheet.append(b);
    }
    const layersBtn = this.button('Layers', () => {
      this.sheet.hidden = !this.sheet.hidden;
      layersBtn.setAttribute('aria-expanded', String(!this.sheet.hidden));
    });
    layersBtn.setAttribute('aria-expanded', 'false');

    this.bar = h(
      'div',
      { class: 'replay-bar lf lf-panel' },
      h(
        'div',
        { class: 'replay-row' },
        this.button('Back', () => this.close()),
        this.button('Last try', () => this.goAttempt(-1), '', ICONS.lastTry),
        this.button('Last death', () => this.jumpDeath(-1), '', ICONS.lastDeath),
        this.playBtn,
        this.button('Next death', () => this.jumpDeath(1), '', ICONS.nextDeath),
        this.button('Next try', () => this.goAttempt(1), '', ICONS.nextTry),
        this.speedBtn,
        layersBtn,
      ),
      h('div', { class: 'replay-row' }, this.scrub, this.clock),
      this.sheet,
    );
    this.root = h('div', { id: 'replay', class: 'lf', role: 'region', 'aria-label': 'Replay' });
    this.root.append(this.info, this.banner, this.bar);
    d.gl.append(this.canvas);
    d.mount(this.root);

    // A tap on the open picture shows the bar or hides it; a tap on the bar or the layers sheet only keeps it up.
    this.root.addEventListener('pointerdown', (ev) => {
      const onBar = ev.target instanceof Node && this.bar.contains(ev.target);
      if (onBar) this.act();
      else if (this.hidden || this.bar.dataset.idle === 'true') this.act();
      else this.hidden = true;
    });
    this.scrub.addEventListener('pointerdown', () => (this.dragging = true));
    this.scrub.addEventListener('pointerup', () => (this.dragging = false));
    this.scrub.addEventListener('pointercancel', () => (this.dragging = false));
    this.scrub.addEventListener('input', () => this.seek(Number(this.scrub.value)));

    this.open(0);
    if (!d.paused) this.transport.play();
    this.sync();
  }

  /** Whether the replay is running (not paused). */
  get playing(): boolean {
    return this.transport.playing;
  }

  /** The recorded tick the replay is at. */
  get tick(): number {
    return this.replayer.tick;
  }

  /** The first mismatch with the recording, or null. */
  get drift(): Replayer['drift'] {
    return this.replayer.drift;
  }

  /** The layers now on. */
  layersOn(): string[] {
    return Object.keys(this.layers).filter((id) => this.layers[id]);
  }

  /** The attempt now showing, by its place in the sample (from 0). */
  get attemptOrder(): number {
    return this.playable[this.at]!;
  }

  /** The level id of the attempt now showing. */
  get levelId(): number {
    return this.replayer.attempt!.id;
  }

  /** Goes to an exact tick of an attempt, by its place in the sample, and holds there. */
  goto(order: number, tick: number): void {
    const k = this.playable.indexOf(order);
    if (k < 0) return;
    if (k !== this.at) this.open(k);
    this.transport.pause();
    this.seek(tick);
  }

  /**
   * Goes to an attempt by its place in the sample and, when a tick is given, to a moment and a half before it, then
   * plays. An attempt that cannot be replayed is left alone.
   */
  watch(order: number, tick?: number): void {
    const k = this.playable.indexOf(order);
    if (k < 0) return;
    if (k !== this.at) this.open(k);
    if (tick !== undefined) {
      const a = this.replayer.attempt!;
      this.seek(Math.max(a.startTick - this.replayer.lateBy, tick - DEATH_LEAD));
    }
    this.transport.play();
    this.sync();
  }

  // ---------- Controls ----------

  /** A button showing its `icon` (when it has one) and its words; a screen reader hears the words alone. */
  private button(label: string, run: () => void, cls = '', icon = ''): HTMLButtonElement {
    const b = h(
      'button',
      { type: 'button', class: `replay-btn ${cls}`.trim() },
      icon ? `${icon} ${label}` : label,
    );
    if (icon) {
      b.setAttribute('aria-label', label);
    }
    b.addEventListener('click', () => {
      this.act();
      run();
    });
    return b;
  }

  /** Notes that the player did something, so the bar stays. */
  act(): void {
    this.hidden = false;
    this.lastAct = performance.now();
    this.bar.dataset.idle = 'false';
  }

  togglePlay(): void {
    if (this.transport.playing) this.transport.pause();
    else {
      // At the end of a try, play starts it again.
      const a = this.replayer.attempt!;
      if (this.replayer.tick >= a.endTick) this.seek(a.startTick);
      this.transport.play();
    }
    this.sync();
  }

  pause(): void {
    this.transport.pause();
    this.sync();
  }

  cycleSpeed(): void {
    this.transport.cycleSpeed();
    this.sync();
  }

  private toggleLayer(id: string): void {
    this.layers[id] = !this.layers[id];
    this.layerBtns.get(id)?.setAttribute('aria-pressed', String(this.layers[id]));
  }

  /** Moves to a tick of this try and holds there until the player plays on. */
  seek(tick: number): void {
    this.replayer.seek(tick);
    this.transport.reset();
    this.said = '';
    this.sync();
  }

  /** The previous or next try the sample can replay. */
  goAttempt(dir: 1 | -1): void {
    const next = this.at + dir;
    if (next < 0 || next >= this.playable.length) return;
    this.open(next);
    this.transport.play();
    this.sync();
  }

  /** To a little before the next or previous death in this try, and plays on from there. */
  jumpDeath(dir: 1 | -1): void {
    const target = nextTarget(this.targets, this.replayer.tick, dir);
    if (target === null) {
      if (dir === 1) this.seek(this.replayer.attempt!.endTick);
      return;
    }
    this.seek(target);
    this.transport.play();
    this.sync();
  }

  /** The buttons and the pad: Jump plays or pauses, Left and Right skip five seconds, Up and Down go by deaths. */
  private handleBits(bits: number): void {
    const edge = bits & ~this.lastBits;
    this.lastBits = bits;
    if (edge) this.act();
    if (edge & (Input.JUMP | Input.CONFIRM)) this.togglePlay();
    if (edge & Input.FIRE) this.cycleSpeed();
    if (edge & Input.LEFT) this.seek(this.replayer.tick - SKIP_TICKS);
    if (edge & Input.RIGHT) this.seek(this.replayer.tick + SKIP_TICKS);
    if (edge & Input.UP) this.jumpDeath(-1);
    if (edge & Input.DOWN) this.jumpDeath(1);
    if (edge & Input.POGO) this.close();
  }

  // ---------- Attempts ----------

  private open(k: number): void {
    this.at = k;
    const i = this.playable[k]!;
    const { replayer } = this;
    replayer.load(i);
    const a = replayer.attempts[i]!;
    this.touches = touchesOf(this.d.session.events, a);
    this.markers = markersOf(this.d.session.events, a);
    this.targets = deathTargets(this.markers, a.startTick - replayer.lateBy);
    this.layout = layoutAt(this.d.session, a.startTick, a.end);
    this.scrub.min = String(a.startTick - replayer.lateBy);
    this.scrub.max = String(a.endTick);
    this.notes = this.buildNote ? [this.buildNote] : [];
    const entry = a.entry;
    if (entry?.levelHash != null && entry.levelHash !== this.d.sim.levelHash(entry.level)) {
      this.notes.push(`${a.name} has been edited since this was recorded, so it may not match.`);
    }
    this.bannerFor = null;
    this.showBanner(a.startTick - replayer.lateBy);
    this.said = '';
    this.transport.reset();
  }

  /** The note above the picture: what is known before it plays, and where it stops matching once it does. */
  private showBanner(first: number): void {
    const drift = this.replayer.drift;
    const text = [...this.notes, ...(drift ? [driftText(drift, first)] : [])].join(' ');
    if (text === this.bannerFor) return;
    this.bannerFor = text;
    this.banner.textContent = text;
    this.banner.hidden = text === '';
  }

  // ---------- Frame ----------

  /** One frame: input, the ticks owed, then the picture and the layers. */
  frame(dt: number, bits: number, view: { halfW: number; halfH: number }): void {
    if (this.closed) return;
    this.handleBits(bits);
    const { sim } = this.d;
    sim.x.set_view(view.halfW, view.halfH);
    const a = this.replayer.attempt!;
    const alpha = this.transport.advance(dt, () => {
      if (this.replayer.tick >= a.endTick) {
        // The try is over: stop there rather than run past what was recorded.
        this.transport.pause();
        this.sync();
        return;
      }
      this.replayer.step();
      this.hear(this.replayer.lastEvents);
    });
    const o = this.d.drawOptions();
    const frame = renderSim(sim, alpha, o);
    drawSimFrame(this.d.renderer, sim, sim.instanceBuffer, frame, {
      halfW: view.halfW,
      halfH: view.halfH,
      normals: o.normals,
      poster: o.poster,
    });
    this.drawLayers(frame, view.halfH);
    const now = performance.now();
    if (now - this.lastText >= TEXT_MS) {
      this.lastText = now;
      this.refresh(now);
    }
  }

  /** Plays what the sim raised on a tick the replay ran by itself (not on one skipped over by a seek). */
  private hear(events: readonly { kind: number; a: number; b: number; c: number }[]): void {
    for (const e of events) {
      if (e.kind !== Ev.CAPTION) continue;
      if (this.layers.sound) this.d.playCaption(e.c, e.a, e.b, this.d.sim.camera);
      this.said = this.d.captionText(e.c) || this.said;
    }
  }

  private drawLayers(frame: SimFrame, halfH: number): void {
    const r = this.d.renderer;
    const w = r.canvasCssW;
    const hh = r.canvasCssH;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(w * dpr);
    const ch = Math.round(hh * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${hh}px`;
    }
    const raw = this.canvas.getContext('2d');
    if (!raw) return;
    const ctx = raw as unknown as Ctx2D & CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const view: WorldView = {
      camX: frame.camX,
      camY: frame.camY,
      ppu: r.pixelsPerUnit(halfH),
      width: w,
      height: hh,
    };
    const a = this.replayer.attempt!;
    const tick = this.replayer.tick;
    const info = a.info;
    const screen = (p: { x: number; y: number }) => toScreen(view, p.x, p.y);

    if (this.layers.others) {
      for (const other of this.replayer.attempts) {
        if (other === a || other.id !== a.id || !other.info) continue;
        drawPolyline(ctx, other.info.path.map(screen), COLOURS.ghost, 2, 0.3);
      }
    }
    if (this.layers.path && info) {
      // A replay that stopped matching shows what was recorded as a ghost, in full, behind its own run.
      if (this.replayer.drift) drawPolyline(ctx, info.path.map(screen), COLOURS.ghost, 2, 0.6);
      drawTrace(
        ctx,
        info.path.filter((p) => p.t <= tick).map((p) => ({ ...screen(p), flag: p.pogo })),
        COLOURS.path,
        COLOURS.pogo,
        3,
        0.9,
      );
    }
    if (this.layers.stays && info) {
      for (const s of dwells(info)) {
        const p = screen(s);
        drawRing(ctx, p.x, p.y, 10 + Math.min(30, s.ticks / 12), COLOURS.dwell);
      }
    }
    if (this.layers.fizz) {
      // Each bubble is its own colour, a little along the colour wheel from the one before: a dot where it was
      // first seen, its path, a bright dot on it while it flies, and a ring where it ended.
      for (const f of this.replayer.fizz.fizz) {
        const colour = shiftedColour(f.n);
        const pts = f.path.map(screen);
        drawPolyline(ctx, pts, colour, 2, 0.85);
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        drawDot(ctx, first.x, first.y, 3, colour);
        if (f.ended) drawRing(ctx, last.x, last.y, 6, colour);
        else drawDot(ctx, last.x, last.y, 5, colour);
      }
    }
    if (this.layers.deaths) {
      ctx.font = '12px sans-serif';
      for (const m of this.markers) {
        if (m.kind !== 'death' || m.x === undefined || m.y === undefined) continue;
        const p = toScreen(view, m.x, m.y);
        drawCross(ctx, p.x, p.y, 8, COLOURS.death);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(m.text, p.x + 12, p.y - 10);
      }
    }
    if (this.layers.touch && this.layout) {
      // The touches are in the recorded window's pixels, so the layer is that window, fitted into this one.
      const lay = this.layout;
      const s = Math.min(w / lay.w, hh / lay.h);
      ctx.save();
      ctx.translate((w - lay.w * s) / 2, (hh - lay.h * s) / 2);
      ctx.scale(s, s);
      drawControls(ctx, lay.placed);
      for (const f of fingersAt(this.touches, tick)) drawFinger(ctx, f);
      ctx.restore();
    }
    if (this.layers.input) this.drawButtons(ctx, w, hh, this.replayer.wordAt(tick));
    for (const x of this.d.extraLayers ?? []) {
      if (this.layers[x.id]) x.draw(ctx, view, { attempt: a, tick });
    }
  }

  /** The buttons as a row of small boxes along the bottom, lit while held. */
  private drawButtons(
    ctx: Ctx2D & CanvasRenderingContext2D,
    w: number,
    hh: number,
    bits: number,
  ): void {
    const size = 46;
    const gap = 6;
    const total = INPUT_BITS.length * (size + gap) - gap;
    const x0 = (w - total) / 2;
    const y = hh - size - 96;
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    INPUT_BITS.forEach((b, i) => {
      const x = x0 + i * (size + gap);
      const on = (bits & b.bit) !== 0;
      ctx.globalAlpha = on ? 0.95 : 0.35;
      ctx.fillStyle = on ? COLOURS.hit : '#ffffff';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#000000';
      ctx.fillText(b.name, x + size / 2, y + size / 2 + 4);
    });
    ctx.restore();
  }

  // ---------- Words ----------

  /** Keeps the buttons' words right after a change. */
  private sync(): void {
    const playing = this.transport.playing;
    this.playBtn.textContent = playing ? `${ICONS.pause} Pause` : `${ICONS.play} Play`;
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.speedBtn.textContent = `${this.transport.speed}x`;
    this.speedBtn.setAttribute('aria-label', `Speed ${this.transport.speed} times`);
    this.refresh(performance.now());
  }

  private refresh(now: number): void {
    const { replayer } = this;
    const a = replayer.attempt!;
    const sim = this.d.sim;
    const first = a.startTick - replayer.lateBy;
    const k = this.at + 1;
    const same = replayer.attempts.filter((x) => x.id === a.id);
    const tryNo = same.indexOf(a) + 1;
    const state = `lives ${sim.get(State.LIVES)}, ammo ${sim.get(State.AMMO)}, score ${sim.get(State.SCORE)}`;
    const held = inputText(replayer.wordAt(replayer.tick));
    const lines = [
      `${a.name}, try ${tryNo} of ${same.length}  (${k} of ${this.playable.length} in the sample)`,
      `${clockText(replayer.tick - first)} of ${clockText(a.endTick - first)}   ${state}`,
      held ? `Holding: ${held}` : '',
      this.said ? `Just now: ${this.said}` : '',
    ].filter(Boolean);
    this.info.replaceChildren(...lines.map((t) => h('div', {}, t)));
    this.clock.textContent = `${clockText(replayer.tick - first)} / ${clockText(a.endTick - first)}`;
    if (!this.dragging) this.scrub.value = String(replayer.tick);
    this.scrub.setAttribute('aria-valuetext', this.clock.textContent);

    this.showBanner(first);
    this.bar.dataset.idle = String(
      this.hidden || (this.transport.playing && now - this.lastAct > BAR_MS && this.sheet.hidden),
    );
  }

  // ---------- Closing ----------

  /** Takes the replay down and hands the screen back. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.pause();
    this.canvas.remove();
    this.root.remove();
    this.d.onClose();
  }
}
