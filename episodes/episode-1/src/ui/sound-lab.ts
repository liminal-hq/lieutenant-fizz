// The sound lab: a ?debug overlay for auditioning effects and tracks and tuning the Enhanced sound by ear.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AudioTune } from '@lieutenant-fizz/engine/audio-tune';
import type { AudioMode, SoundAt } from '@lieutenant-fizz/engine/sound-field';
import {
  FIELD_SLIDERS,
  LAB_DEFAULTS,
  MASTER_SLIDERS,
  MAX_DISTANCE,
  PAN_SLIDERS,
  auditionAt,
  countChanges,
  formatValue,
  fromPosition,
  inputAttrs,
  mixSliders,
  patchFor,
  readPath,
  roomSliders,
  toPosition,
  tuneDiff,
  tuneJson,
  type LabItem,
  type LabState,
  type SliderSpec,
} from '../audio/lab';

/** What the lab needs from the game. The game owns every audio call; the lab only holds the controls. */
export interface LabHost {
  sfx: LabItem[];
  music: LabItem[];
  rooms: LabItem[];
  mixes: LabItem[];
  playSfx(name: string, at: SoundAt): void;
  /** Plays a track, or stops the music for null. The game's own choice is back with `followGame`. */
  playMusic(name: string | null): void;
  followGame(): void;
  mode(): AudioMode;
  setMode(mode: AudioMode): void;
  /** The room held by the lab (null follows the level) and the one the sound is in. */
  room(): { held: string | null; current: string };
  setRoom(name: string | null): void;
  mix(): { held: string | null; current: string };
  setMix(name: string | null): void;
  tune(patch: AudioTune): void;
  state(): LabState;
  /** One line about the audio: context state, mode, whether music and sound are on in Options. */
  status(): string;
  copy(text: string): Promise<boolean>;
}

type TabId = 'sounds' | 'music' | 'space' | 'master';

const TABS: [TabId, string][] = [
  ['sounds', 'Sounds'],
  ['music', 'Music'],
  ['space', 'Rooms and mix'],
  ['master', 'Master'],
];

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/** The overlay and its button. Both are hidden until opened, and exist only under ?debug. */
export class SoundLab {
  readonly button: HTMLButtonElement;
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly sections = new Map<TabId, HTMLElement>();
  private readonly modeButtons = new Map<AudioMode, HTMLButtonElement>();
  private readonly copyBtn: HTMLButtonElement;
  private readonly status = el('div', { class: 'lab-status' });
  private readonly note = el('div', { class: 'lab-status' });
  private readonly trackButtons = new Map<string, HTMLButtonElement>();
  private readonly roomButtons = new Map<string | null, HTMLButtonElement>();
  private readonly mixButtons = new Map<string | null, HTMLButtonElement>();
  private readonly roomHost = el('div');
  private readonly mixHost = el('div');
  private readonly refreshers: (() => void)[] = [];
  /** Syncs for the room and mix sliders, which are rebuilt whenever the pick changes. */
  private dynamic: (() => void)[] = [];
  private pan = 0;
  private distance = 0;
  private pickedRoom = 'neutral';
  private pickedMix = 'pause';
  private timer = 0;
  /** Escape closes the lab and goes no further, so it does not also pause the game underneath. */
  private readonly onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.close();
  };

  constructor(private readonly h: LabHost) {
    this.button = el('button', { id: 'labBtn', class: 'lf', 'aria-label': 'Sound lab' }, 'Lab');
    this.button.addEventListener('click', () => this.toggle());
    this.root = el('div', { id: 'lab', class: 'lf lf-panel', hidden: '' });
    // Arrow keys and Space move sliders and press buttons here; they must not reach the game's input.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    const head = el('div', { class: 'lab-head' });
    head.append(el('b', {}, 'Sound lab'));
    const modes = el('div', { class: 'lab-row' });
    for (const [mode, label] of [
      ['classic', 'Classic'],
      ['enhanced', 'Enhanced'],
    ] as const) {
      const b = el('button', { 'aria-pressed': 'false' }, label);
      b.addEventListener('click', () => {
        this.h.setMode(mode);
        this.refresh();
      });
      this.modeButtons.set(mode, b);
      modes.append(b);
    }
    this.copyBtn = el('button', {}, 'Copy as JSON');
    this.copyBtn.addEventListener('click', () => void this.copy());
    const reset = el('button', {}, 'Reset to defaults');
    reset.addEventListener('click', () => this.reset());
    const close = el('button', {}, 'Close');
    close.addEventListener('click', () => this.close());
    head.append(modes, this.copyBtn, reset, close);

    const tabs = el('div', { class: 'lab-row lab-tabs', role: 'tablist' });
    for (const [id, label] of TABS) {
      const b = el('button', { role: 'tab' }, label);
      b.addEventListener('click', () => this.show(id));
      this.tabButtons.set(id, b);
      tabs.append(b);
    }
    this.body = el('div', { class: 'lab-body' });
    this.root.append(head, tabs, this.note, this.body);
    this.sections.set('sounds', this.buildSounds());
    this.sections.set('music', this.buildMusic());
    this.sections.set('space', this.buildSpace());
    this.sections.set('master', this.buildMaster());
    for (const s of this.sections.values()) this.body.append(s);
    this.show('sounds');
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.button.hidden = true;
    this.refresh();
    this.timer = window.setInterval(() => this.refreshStatus(), 500);
    window.addEventListener('keydown', this.onEscape, true);
  }

  close(): void {
    this.root.hidden = true;
    this.button.hidden = false;
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.onEscape, true);
  }

  /** Closes the lab, puts every tuned value back and takes its button and overlay out of the page. */
  dispose(): void {
    this.close();
    this.reset();
    this.button.remove();
    this.root.remove();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  show(tab: TabId): void {
    for (const [id, s] of this.sections) s.hidden = id !== tab;
    for (const [id, b] of this.tabButtons) b.setAttribute('aria-selected', String(id === tab));
    this.body.scrollTop = 0;
  }

  // ----- Sections -----

  private group(title: string, ...children: HTMLElement[]): HTMLElement {
    const g = el('section', { class: 'lab-group' });
    g.append(el('h4', {}, title), ...children);
    return g;
  }

  private buildSounds(): HTMLElement {
    const s = el('div');
    const place = el('div', { class: 'lab-sliders' });
    place.append(
      this.rawSlider('Pan', -1, 1, 0.05, 0, (v) => {
        this.pan = v;
      }),
      this.rawSlider('Distance', 0, MAX_DISTANCE, 0.25, 0, (v) => {
        this.distance = v;
      }),
    );
    const grid = el('div', { class: 'lab-grid' });
    for (const item of this.h.sfx) {
      const b = el('button', {}, item.label);
      b.addEventListener('click', () => {
        this.h.playSfx(item.id, auditionAt(this.pan, this.distance, this.h.state().field));
        this.refreshStatus();
      });
      grid.append(b);
    }
    s.append(
      this.group('Place the sound (Enhanced only)', place, this.status),
      this.group('Sound effects', grid),
    );
    return s;
  }

  private buildMusic(): HTMLElement {
    const grid = el('div', { class: 'lab-grid' });
    for (const item of this.h.music) {
      const b = el('button', { 'aria-pressed': 'false' }, item.label);
      b.addEventListener('click', () => {
        const playing = b.getAttribute('aria-pressed') === 'true';
        this.h.playMusic(playing ? null : item.id);
        this.markTrack(playing ? null : item.id);
      });
      this.trackButtons.set(item.id, b);
      grid.append(b);
    }
    const follow = el('button', {}, 'Follow the game');
    follow.addEventListener('click', () => {
      this.h.followGame();
      this.markTrack(null);
    });
    const row = el('div', { class: 'lab-row' });
    row.append(follow);
    const s = el('div');
    s.append(this.group('Tracks (tap again to stop)', row, grid));
    return s;
  }

  private buildSpace(): HTMLElement {
    const picker = (
      items: LabItem[],
      into: Map<string | null, HTMLButtonElement>,
      follow: string,
      pick: (id: string | null) => void,
    ): HTMLElement => {
      const grid = el('div', { class: 'lab-grid' });
      for (const id of [null, ...items.map((i) => i.id)]) {
        const b = el('button', { 'aria-pressed': 'false' }, id ?? follow);
        b.addEventListener('click', () => pick(id));
        into.set(id, b);
        grid.append(b);
      }
      return grid;
    };
    const rooms = picker(this.h.rooms, this.roomButtons, 'Follow level', (id) => {
      this.h.setRoom(id);
      this.pickedRoom = id ?? this.h.room().current;
      this.refresh();
    });
    const mixes = picker(this.h.mixes, this.mixButtons, 'Follow screen', (id) => {
      this.h.setMix(id);
      this.pickedMix = id ?? this.h.mix().current;
      this.refresh();
    });
    const s = el('div');
    s.append(
      this.group('Room', rooms, this.roomHost),
      this.group('Music mix', mixes, this.mixHost),
    );
    return s;
  }

  private buildMaster(): HTMLElement {
    const s = el('div');
    const section = (title: string, specs: readonly SliderSpec[]): HTMLElement => {
      const host = el('div', { class: 'lab-sliders' });
      for (const spec of specs) host.append(this.specSlider(spec));
      return this.group(title, host);
    };
    s.append(
      section('Master chain', MASTER_SLIDERS),
      section('Effect field', FIELD_SLIDERS),
      section('Music pans', PAN_SLIDERS),
    );
    return s;
  }

  // ----- Sliders -----

  /** A slider with a label and a value, not tied to the tuning tables (the audition placement). */
  private rawSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    set: (v: number) => void,
  ): HTMLElement {
    const row = el('label', { class: 'lab-slider' });
    const name = el('span', {}, label);
    const out = el('b', {}, String(value));
    const input = el('input', {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
    });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = String(v);
      set(v);
    });
    row.append(name, out, input);
    return row;
  }

  /** A slider bound to a tuning value, applied as it moves or on release, and kept in step with the tables. */
  private specSlider(spec: SliderSpec, syncs: (() => void)[] = this.refreshers): HTMLElement {
    const row = el('label', { class: 'lab-slider' });
    const out = el('b');
    const a = inputAttrs(spec);
    const input = el('input', {
      type: 'range',
      min: String(a.min),
      max: String(a.max),
      step: String(a.step),
    });
    const show = (v: number): void => {
      out.textContent = formatValue(spec, v);
    };
    const apply = (): void => {
      const v = fromPosition(spec, Number(input.value));
      show(v);
      this.h.tune(patchFor(spec, v, this.h.state()));
      this.refreshCount();
    };
    input.addEventListener('input', () => {
      if (spec.onRelease) show(fromPosition(spec, Number(input.value)));
      else apply();
    });
    input.addEventListener('change', () => {
      if (spec.onRelease) apply();
    });
    const sync = (): void => {
      const v = readPath(this.h.state(), spec.path);
      if (v === undefined) return;
      input.value = String(toPosition(spec, v));
      show(v);
    };
    syncs.push(sync);
    row.append(el('span', {}, spec.label), out, input);
    sync();
    return row;
  }

  /** Fills a host with the sliders for the picked room or mix state; they are rebuilt when the pick changes. */
  private fill(host: HTMLElement, specs: SliderSpec[]): void {
    host.replaceChildren();
    const box = el('div', { class: 'lab-sliders' });
    for (const spec of specs) box.append(this.specSlider(spec, this.dynamic));
    host.append(box);
  }

  // ----- State -----

  private markTrack(id: string | null): void {
    for (const [k, b] of this.trackButtons) b.setAttribute('aria-pressed', String(k === id));
  }

  private refreshStatus(): void {
    this.status.textContent = this.h.status();
  }

  private refreshCount(): void {
    const n = countChanges(tuneDiff(LAB_DEFAULTS, this.h.state()));
    this.copyBtn.textContent = n > 0 ? `Copy as JSON (${n} changed)` : 'Copy as JSON';
  }

  /** Brings every control in line with the game: mode, held room and mix, slider values. */
  refresh(): void {
    for (const [m, b] of this.modeButtons)
      b.setAttribute('aria-pressed', String(m === this.h.mode()));
    const room = this.h.room();
    const mix = this.h.mix();
    this.pickedRoom = room.held ?? room.current;
    this.pickedMix = mix.held ?? mix.current;
    for (const [k, b] of this.roomButtons) b.setAttribute('aria-pressed', String(k === room.held));
    for (const [k, b] of this.mixButtons) b.setAttribute('aria-pressed', String(k === mix.held));
    this.dynamic = [];
    this.fill(this.roomHost, roomSliders(this.pickedRoom));
    this.fill(this.mixHost, mixSliders(this.pickedMix));
    for (const r of [...this.refreshers, ...this.dynamic]) r();
    this.refreshStatus();
    this.refreshCount();
    this.note.textContent =
      this.h.mode() === 'classic'
        ? 'Classic plays the effects centred and builds no master chain, rooms or mix; the sliders take effect in Enhanced.'
        : '';
    this.note.hidden = this.note.textContent === '';
  }

  private async copy(): Promise<void> {
    const text = tuneJson(tuneDiff(LAB_DEFAULTS, this.h.state()));
    const ok = await this.h.copy(text);
    this.copyBtn.textContent = ok ? 'Copied' : 'Copy failed: see the console';
    if (!ok) console.log(text);
    window.setTimeout(() => this.refreshCount(), 1500);
  }

  private reset(): void {
    this.h.tune(tuneDiff(this.h.state(), LAB_DEFAULTS));
    this.refresh();
  }
}
