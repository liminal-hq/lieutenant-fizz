// DOM menus, HUD, prompts and option screens layered over the game canvas.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { CreditsContent } from '@lieutenant-fizz/engine/credits';
import { EGA } from '@lieutenant-fizz/engine/palette';
import type { Grid } from '@lieutenant-fizz/engine/pen';
import type { StingerContent, StingerPhase } from '@lieutenant-fizz/engine/stinger';
import './ui.css';

export interface MenuItem {
  label: string;
  value?: string;
  disabled?: boolean;
}

export interface HudState {
  score: number;
  lives: number;
  ammo: number;
  red: boolean;
  blue: boolean;
  green: boolean;
  usb: boolean;
}

export interface Prompt {
  title: string;
  text: string;
  action: string | null;
}

export interface CreditsView {
  content: CreditsContent;
  reduced: boolean;
  page: number;
  held: boolean;
  fast: boolean;
  /** Pixels travelled from the off-screen start (scrolling form only). */
  offset: number;
}

export interface StingerView {
  content: StingerContent;
  phase: StingerPhase;
  shown: string;
  hidden: string;
  done: boolean;
  /** Whether to show the sound caption pill while the sting lands. */
  caption: boolean;
}

export interface Stats {
  fps: number;
  ms: string;
  tick: number;
  inst: number;
  world: number;
  calls: number;
  lights: number;
  zoom: number;
  tall: number;
  pad: boolean;
}

export type OptionKey =
  'lighting' | 'normals' | 'poster' | 'culling' | 'stress' | 'captions' | 'night' | 'music' | 'sfx';

export interface UiHandlers {
  menuClick(i: number): void;
  menuHover(i: number): void;
  advance(): void;
  skipCine(): void;
  toggle(k: OptionKey): void;
  zoom(f: number | 'reset'): void;
  backFromControls(): void;
  creditsPress(): void;
  creditsSkip(): void;
  stingerPress(): void;
  stingerSkip(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
};

/** Finds a child the markup is known to contain, failing loudly if the template drifts. */
const need = (root: ParentNode, selector: string): HTMLElement => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`UI template is missing ${selector}`);
  return found;
};

const fmt = (n: number): string => Math.round(n).toLocaleString('en-CA');

/** The DOM overlay. All text is static or comes from the game's own content tables. */
export class Ui {
  readonly stage: HTMLElement;
  readonly gl: HTMLElement;
  readonly fx: HTMLElement;
  private readonly sky: HTMLElement;
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly title: HTMLElement;
  private readonly menuEl: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly overlayMenu: HTMLElement;
  private readonly overlayNote: HTMLElement;
  private readonly letterbox: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelBtn: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly stinger: HTMLElement;
  private creditsFor: CreditsContent | null = null;
  private creditsTrack: HTMLElement | null = null;
  private creditsEnd: HTMLElement | null = null;
  private creditsBlocks: HTMLElement[] = [];
  private creditsOffset = Number.NaN;
  private readonly err: HTMLElement;
  private readonly loading: HTMLElement;
  private toastTimer = 0;
  private panelOpen = false;
  private panelVisibleAllowed = true;
  private readonly toggles = new Map<OptionKey, HTMLButtonElement>();

  constructor(
    host: HTMLElement,
    private readonly h: UiHandlers,
  ) {
    this.stage = host;
    this.sky = el('div', { id: 'sky', hidden: '' });
    this.gl = el('div', { id: 'gl' });
    this.fx = el('div', { id: 'fx' });
    this.root = el('div', { id: 'ui' });
    host.append(this.sky, this.gl, this.fx, this.root);

    this.hud = el('div', { id: 'hud', class: 'lf lf-panel', hidden: '' });
    this.boss = el('div', { id: 'boss', class: 'lf lf-panel', hidden: '' });
    this.prompt = el('div', { id: 'prompt', class: 'lf lf-panel', hidden: '' });
    this.toastEl = el('div', { id: 'toast', class: 'lf lf-panel', hidden: '' });

    this.title = el('div', { id: 'title', class: 'lf screen', hidden: '' });
    this.title.innerHTML = `<div class="head"><h1 class="wordmark"><span class="kicker">Ben Blaze in</span><span class="hero">Lieutenant Fizz</span></h1>
      <p class="episode">Episode 1 · The Cocoa Caper</p></div>`;
    this.menuEl = el('div', { class: 'menu' });
    this.controls = el('div', { id: 'controls', hidden: '' });
    this.controls.innerHTML = `<table>
      <tr><th>Action</th><th>Keen-style</th><th>Modern</th><th>Gamepad</th></tr>
      <tr><td>Move</td><td>← →</td><td>← → / A D</td><td>D-pad / stick</td></tr>
      <tr><td>Jump</td><td>Ctrl</td><td>Z</td><td>A</td></tr>
      <tr><td>Pogo (toggle)</td><td>Alt</td><td>X</td><td>B / Y</td></tr>
      <tr><td>Fizz</td><td>Space</td><td>C</td><td>X / RT</td></tr>
      <tr><td>Menu</td><td>Esc</td><td>Esc / P</td><td>Start</td></tr>
      <tr><td>Save / Load</td><td>F5 / F9</td><td>F5 / F9</td><td>Pause menu</td></tr>
    </table>
    <p class="note">Hold jump while pogoing for a high bounce. Aim fizz up with ↑, or down with ↓ in the air.</p>`;
    const back = el('button', { class: 'back' }, 'Back');
    back.addEventListener('click', () => h.backFromControls());
    this.controls.append(back);
    const keys = el('div', { class: 'keys' });
    keys.innerHTML = `<span><kbd>↑ ↓</kbd>Choose</span><span><kbd>Enter</kbd><kbd>A</kbd>Select</span>`;
    this.title.append(this.menuEl, this.controls, keys);

    this.overlay = el('div', { id: 'overlay', class: 'lf screen', hidden: '' });
    const box = el('div', { class: 'box' });
    box.innerHTML = '<h2></h2><p class="text"></p>';
    this.overlayMenu = el('div', { class: 'menu' });
    this.overlayNote = el('p', { class: 'note' });
    box.append(this.overlayMenu, this.overlayNote);
    this.overlay.append(box);

    this.letterbox = el('div', { id: 'letterbox', class: 'lf', hidden: '' });
    this.letterbox.innerHTML = `<div class="bar"><span class="place"></span><button class="btn ghost skip">Skip</button></div>
      <div class="bar bottom"><div class="text"><span class="shown"></span><span class="hidden-text"></span></div>
      <div class="foot"><span class="pips"></span><button class="btn next">Continue</button></div></div>`;
    this.letterbox.querySelector('.skip')?.addEventListener('click', () => h.skipCine());
    this.letterbox.querySelector('.next')?.addEventListener('click', () => h.advance());

    this.dialogue = el('div', { id: 'dialogue', class: 'lf lf-panel', hidden: '' });
    this.dialogue.innerHTML = `<div class="who"></div><div class="text"><span class="shown"></span><span class="hidden-text"></span></div>
      <div class="foot"><button class="btn next">Continue</button></div>`;
    this.dialogue.querySelector('.next')?.addEventListener('click', () => h.advance());

    this.credits = el('div', { id: 'credits', class: 'lf', hidden: '' });
    this.credits.addEventListener('click', () => h.creditsPress());
    this.stinger = el('div', { id: 'stinger', class: 'lf', hidden: '', 'data-phase': 'silence' });
    this.stinger.innerHTML = `<div class="slit"></div><canvas class="figure" aria-label="" role="img"></canvas>
      <div class="name"></div><span class="sound" hidden></span>
      <div class="box"><div class="in"><span class="place"></span>
        <span class="line"><span class="shown"></span><span class="hidden-text"></span></span>
        <div class="hints"><button class="hint skip"><kbd>Esc</kbd>Skip</button>
          <span class="hint go"><span class="cursor">▌</span><kbd>Jump</kbd>Continue</span></div></div></div>`;
    this.stinger.addEventListener('click', () => h.stingerPress());
    need(this.stinger, '.skip').addEventListener('click', (e) => {
      e.stopPropagation();
      h.stingerSkip();
    });

    this.panelBtn = el(
      'button',
      {
        id: 'panelBtn',
        class: 'lf',
        hidden: '',
        title: 'Engine panel (`)',
        'aria-label': 'Engine panel',
      },
      'Engine ↙',
    );
    this.panelBtn.addEventListener('click', () => this.togglePanel());
    this.panel = el('div', { id: 'panel', class: 'lf lf-panel', hidden: '' });
    this.buildPanel();

    this.loading = el('div', { id: 'loading', class: 'lf' }, 'Loading Zargoth…');
    this.err = el('div', { id: 'err', class: 'lf', hidden: '' });

    this.root.append(
      this.hud,
      this.boss,
      this.prompt,
      this.toastEl,
      this.title,
      this.overlay,
      this.letterbox,
      this.dialogue,
      this.credits,
      this.stinger,
      this.panelBtn,
      this.panel,
      this.loading,
      this.err,
    );
  }

  private buildPanel(): void {
    const kv = (id: string, label: string): string =>
      `<div class="kv"><span>${label}</span><b id="pk-${id}">-</b></div>`;
    this.panel.innerHTML = `<h3>Engine <button class="btn ghost" id="pk-close" style="padding:2px 10px">Close</button></h3>
      ${kv('fps', 'Frame')}${kv('sim', 'Simulation')}${kv('inst', 'Instances')}${kv('world', 'World instances')}
      ${kv('calls', 'Draw calls')}${kv('lights', 'Lights')}${kv('zoom', 'Zoom')}${kv('pad', 'Gamepad')}
      <div class="tg" id="pk-zoom"></div><div class="tg" id="pk-toggles"></div>`;
    this.panel.querySelector('#pk-close')?.addEventListener('click', () => this.togglePanel());
    const zoom = need(this.panel, '#pk-zoom');
    for (const [label, f] of [
      ['Zoom in', 1.25],
      ['Zoom out', 0.8],
      ['Reset', 'reset' as const],
    ] as const) {
      const b = el('button', {}, label);
      b.addEventListener('click', () => this.h.zoom(f));
      zoom.append(b);
    }
    const tg = need(this.panel, '#pk-toggles');
    const defs: [OptionKey, string][] = [
      ['lighting', 'Lighting'],
      ['normals', 'Normals'],
      ['poster', 'Posterise'],
      ['culling', 'Culling'],
      ['stress', '50k stress'],
      ['captions', 'Captions'],
      ['night', 'Night'],
      ['music', 'Music'],
      ['sfx', 'Sound'],
    ];
    for (const [k, label] of defs) {
      const b = el('button', {}, label);
      b.addEventListener('click', () => this.h.toggle(k));
      this.toggles.set(k, b);
      tg.append(b);
    }
  }

  setToggle(k: OptionKey, on: boolean): void {
    this.toggles.get(k)?.classList.toggle('on', on);
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    this.syncPanel();
  }

  /** The engine panel button is shown on the title and in play only. */
  allowPanel(allowed: boolean): void {
    this.panelVisibleAllowed = allowed;
    this.syncPanel();
  }

  private syncPanel(): void {
    this.panel.hidden = !(this.panelOpen && this.panelVisibleAllowed);
    this.panelBtn.hidden = this.panelOpen || !this.panelVisibleAllowed;
  }

  setSky(on: boolean): void {
    this.sky.hidden = !on;
  }

  setLoading(on: boolean): void {
    this.loading.hidden = !on;
  }

  showError(msg: string): void {
    this.err.hidden = false;
    this.err.innerHTML = '<div><h2>Ben’s saucer hit a snag</h2><p></p></div>';
    need(this.err, 'p').textContent = msg;
  }

  // ----- HUD, prompt, toast, boss -----

  setHud(s: HudState | null): void {
    this.hud.hidden = !s;
    if (!s) return;
    this.hud.innerHTML = `<div class="row"><span class="lbl">Score</span><span class="lbl">Lives</span><span class="lbl">Fizz</span>
      <span class="num" style="color:#ffff55">${fmt(s.score)}</span>
      <span class="num" style="color:#55ff55">${Math.max(0, s.lives)}</span>
      <span class="num" style="color:#55ffff">${s.ammo}</span></div>
      <div class="badges"><span class="lbl">Next life at ${(Math.floor(s.score / 100) + 1) * 100}</span>
      ${s.red ? '<span class="badge" style="color:#ff5555">Red gumdrop</span>' : ''}
      ${s.blue ? '<span class="badge" style="color:#8888ff">Blue gumdrop</span>' : ''}
      ${s.green ? '<span class="badge" style="color:#55ff55">Green gumdrop</span>' : ''}
      ${s.usb ? '<span class="badge" style="color:#ffff55">Gold USB</span>' : ''}</div>`;
  }

  setBoss(hp: number | null): void {
    this.boss.hidden = hp === null;
    if (hp === null) return;
    this.boss.innerHTML = `<span>Cocoa Colossus</span><span class="pips">${'●'.repeat(Math.max(0, hp))}${'○'.repeat(Math.max(0, 3 - hp))}</span>`;
  }

  setPrompt(p: Prompt | null): void {
    this.prompt.hidden = !p;
    if (!p) return;
    this.prompt.innerHTML = '<div class="t"></div><div class="d"></div><div class="a"></div>';
    need(this.prompt, '.t').textContent = p.title;
    need(this.prompt, '.d').textContent = p.text;
    need(this.prompt, '.a').textContent = p.action
      ? `Jump, fire or Enter to ${p.action.toLowerCase()}`
      : '';
  }

  toast(text: string): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.hidden = false;
    this.toastEl.textContent = text;
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 2800);
  }

  // ----- Menus -----

  private renderMenu(into: HTMLElement, items: MenuItem[], sel: number): void {
    into.replaceChildren();
    items.forEach((it, i) => {
      const b = el('button', {
        class: `${i === sel && !it.disabled ? 'sel' : ''} ${it.disabled ? 'dis' : ''}`,
      });
      const l = el('span');
      l.textContent = it.label;
      b.append(l);
      if (it.value) {
        const v = el('span', { class: 'val' });
        v.textContent = it.value;
        b.append(v);
      }
      b.addEventListener('click', () => this.h.menuClick(i));
      b.addEventListener('mouseenter', () => this.h.menuHover(i));
      into.append(b);
    });
  }

  showTitle(items: MenuItem[] | null, sel: number, controls: boolean): void {
    this.title.hidden = items === null && !controls;
    if (items) this.renderMenu(this.menuEl, items, sel);
    this.menuEl.hidden = controls || items === null;
    this.controls.hidden = !controls;
  }

  showOverlay(
    o: { title: string; text: string; note?: string; items: MenuItem[]; sel: number } | null,
  ): void {
    this.overlay.hidden = !o;
    if (!o) return;
    need(this.overlay, 'h2').textContent = o.title;
    const p = need(this.overlay, '.text');
    p.textContent = o.text;
    p.hidden = !o.text;
    this.overlayNote.textContent = o.note ?? '';
    this.overlayNote.hidden = !o.note;
    this.renderMenu(this.overlayMenu, o.items, o.sel);
  }

  showLetterbox(
    o: {
      place: string;
      shown: string;
      hidden: string;
      pips: string;
      done: boolean;
      last: boolean;
      skip: boolean;
    } | null,
  ): void {
    this.letterbox.hidden = !o;
    if (!o) return;
    const q = (s: string): HTMLElement => need(this.letterbox, s);
    q('.place').textContent = o.place;
    q('.shown').textContent = o.shown;
    q('.hidden-text').textContent = o.hidden;
    q('.pips').textContent = o.pips;
    q('.next').textContent = !o.done ? 'Hurry' : o.last && o.skip ? 'Step out' : 'Continue';
    q('.skip').hidden = !o.skip;
  }

  showDialogue(o: { who: string; shown: string; hidden: string; done: boolean } | null): void {
    this.dialogue.hidden = !o;
    if (!o) return;
    const q = (s: string): HTMLElement => need(this.dialogue, s);
    q('.who').textContent = o.who;
    q('.shown').textContent = o.shown;
    q('.hidden-text').textContent = o.hidden;
    q('.next').textContent = o.done ? 'Continue' : 'Hurry';
  }

  // ----- Credits and stinger -----

  private buildCredits(c: CreditsContent): void {
    const blocks: HTMLElement[] = [];
    const title = el('div', { class: 'blk card' });
    title.innerHTML = '<span class="big"></span><span class="sub"></span>';
    need(title, '.big').textContent = c.title;
    need(title, '.sub').textContent = c.subtitle;
    blocks.push(title);
    for (const sec of c.sections) {
      const b = el('div', { class: 'blk section' });
      const head = el('span', { class: 'head' });
      head.textContent = sec.head;
      const lines = el('div', { class: 'lines' });
      for (const ln of sec.lines) {
        const row = el(
          'div',
          { class: 'ln' },
          '<span class="role"></span><span class="who"></span>',
        );
        need(row, '.role').textContent = ln.role;
        need(row, '.who').textContent = ln.name;
        lines.append(row);
      }
      b.append(head, lines);
      blocks.push(b);
    }
    const end = el('div', { class: 'blk end' });
    end.innerHTML =
      '<span class="thanks"></span><span class="line"></span><div class="echo"><span class="big"></span><span class="sub"></span><span class="ret"></span></div>';
    need(end, '.echo .big').textContent = c.title;
    need(end, '.echo .sub').textContent = c.subtitle;
    need(end, '.thanks').textContent = c.thanks;
    need(end, '.line').textContent = c.thanksLine;
    need(end, '.ret').textContent = c.returnLine;
    blocks.push(end);
    const track = el('div', { class: 'track' });
    track.append(...blocks);
    this.credits.replaceChildren();
    this.credits.innerHTML = '<div class="glow"></div><div class="stars"></div>';
    const stars = need(this.credits, '.stars');
    for (let i = 0; i < 30; i++) {
      const d = el('i');
      d.style.left = `${((i * 37 + 11) % 97) + 1}%`;
      d.style.top = `${((i * 53 + 7) % 93) + 2}%`;
      d.style.width = d.style.height = `${i % 5 === 0 ? 3 : 2}px`;
      d.style.opacity = String(0.25 + (i % 4) * 0.15);
      stars.append(d);
    }
    const foot = el('div', { class: 'foot' });
    foot.innerHTML =
      '<button class="hint skip"><kbd>Esc</kbd>Skip credits</button><span class="hint go"><kbd>Jump</kbd><span class="act"></span></span>';
    need(foot, '.skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.creditsSkip();
    });
    this.credits.append(
      track,
      el('div', { class: 'fade top' }),
      el('div', { class: 'fade bot' }),
      foot,
    );
    this.creditsFor = c;
    this.creditsTrack = track;
    this.creditsEnd = end;
    this.creditsBlocks = blocks;
    this.creditsOffset = Number.NaN;
  }

  /** Shows, updates or hides the credits. Returns nothing; read `creditsMetrics` to lay out the roll. */
  showCredits(v: CreditsView | null): void {
    this.credits.hidden = !v;
    if (!v) {
      this.creditsFor = null;
      return;
    }
    if (this.creditsFor !== v.content) this.buildCredits(v.content);
    const root = this.credits;
    root.classList.toggle('reduced', v.reduced);
    root.classList.toggle('held', v.held);
    this.creditsBlocks.forEach((b, i) => b.classList.toggle('on', !v.reduced || i === v.page));
    const act = !v.reduced
      ? v.held
        ? 'Continue'
        : v.fast
          ? 'Normal speed'
          : 'Speed up'
      : v.held
        ? 'Continue'
        : 'Next';
    need(root, '.act').textContent = act;
    if (!v.reduced && this.creditsTrack && v.offset !== this.creditsOffset) {
      this.creditsOffset = v.offset;
      const y = root.clientHeight - v.offset;
      this.creditsTrack.style.transform = `translateY(${y.toFixed(1)}px)`;
    }
    if (v.reduced && this.creditsTrack) {
      this.creditsTrack.style.transform = 'none';
      this.creditsOffset = Number.NaN;
    }
  }

  /** Visible height and the distance the roll travels to centre the closing card, in pixels. */
  creditsMetrics(): { viewport: number; total: number } | null {
    const end = this.creditsEnd;
    if (!end || this.credits.hidden) return null;
    const viewport = this.credits.clientHeight;
    const target = viewport / 2 - (end.offsetTop + end.offsetHeight / 2);
    return { viewport, total: viewport - target };
  }

  private stingerFor: StingerContent | null = null;

  /** Shows, updates or hides the stinger scene. `grid` is the figure sprite, drawn once per scene. */
  showStinger(v: StingerView | null, grid?: Grid): void {
    this.stinger.hidden = !v;
    if (!v) {
      this.stingerFor = null;
      return;
    }
    const root = this.stinger;
    if (this.stingerFor !== v.content) {
      this.stingerFor = v.content;
      need(root, '.name').textContent = v.content.name;
      need(root, '.place').textContent = v.content.place;
      need(root, '.sound').textContent = v.content.caption;
      const canvas = need(root, '.figure') as HTMLCanvasElement;
      canvas.setAttribute('aria-label', v.content.name);
      if (grid) this.paintGrid(canvas, grid);
    }
    root.dataset.phase = v.phase;
    root.classList.toggle('typed', v.done);
    need(root, '.sound').hidden = !(v.caption && v.phase === 'slit');
    need(root, '.shown').textContent = v.shown;
    need(root, '.hidden-text').textContent = v.hidden;
  }

  private paintGrid(canvas: HTMLCanvasElement, grid: Grid): void {
    canvas.width = grid.w;
    canvas.height = grid.h;
    const g = canvas.getContext('2d');
    if (!g) return;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.at(x, y);
        if (!c) continue;
        g.fillStyle = EGA[c];
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  // ----- Captions and stats -----

  /** A floating sound caption at a screen position (CSS pixels). */
  caption(x: number, y: number, text: string, colour: string): void {
    const d = el('div', { class: 'cap' });
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.color = colour;
    this.fx.append(d);
    const a = d.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 1 },
        { transform: 'translate(-50%,-60%) scale(1.05)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-180%)', opacity: 0 },
      ],
      { duration: 950, easing: 'ease-out' },
    );
    a.onfinish = () => d.remove();
  }

  setStats(s: Stats): void {
    if (this.panel.hidden) return;
    const set = (id: string, v: string): void => {
      const e = this.panel.querySelector(`#pk-${id}`);
      if (e) e.textContent = v;
    };
    set('fps', `${s.fps} fps · ${s.ms} ms`);
    set('sim', `60 Hz · tick ${fmt(s.tick)}`);
    set('inst', `${fmt(s.inst)} / 120,000`);
    set('world', fmt(s.world));
    set('calls', String(s.calls));
    set('lights', `${s.lights} / 16 point`);
    set('zoom', `${s.zoom.toFixed(2)}× · ${s.tall.toFixed(1)} tiles`);
    set('pad', s.pad ? 'Connected' : 'None');
  }
}
